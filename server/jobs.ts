import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "dead";

export interface JobRecord<TPayload = Record<string, unknown>> {
  id: string;
  workspaceId?: string;
  type: string;
  payload: TPayload;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt?: Date;
  lockedBy?: string;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  dedupeKey?: string;
}

export interface EnqueueJobInput<TPayload = Record<string, unknown>> {
  workspaceId?: string;
  type: string;
  payload: TPayload;
  dedupeKey?: string;
  maxAttempts?: number;
  availableAt?: Date;
}

export interface JobStore<TPayload = Record<string, unknown>> {
  enqueue(input: EnqueueJobInput<TPayload>): Promise<JobRecord<TPayload>>;
  claim(workerId: string, now?: Date): Promise<JobRecord<TPayload> | null>;
  complete(jobId: string, workerId?: string, now?: Date): Promise<void>;
  fail(
    jobId: string,
    error: unknown,
    now?: Date,
    workerId?: string,
  ): Promise<JobRecord<TPayload> | null>;
  listDeadLetters(): Promise<JobRecord<TPayload>[]>;
}

export const jobErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Keep provider/database details useful for retries without persisting secrets. */
export function redactJobError(error: unknown): string {
  return jobErrorMessage(error)
    .replace(
      /(authorization|api[-_]?key|token|secret|password|cookie)(\s*[:=]\s*)[^\s,;]+/gi,
      "$1$2[redacted]",
    )
    .slice(0, 2_000);
}

export const jobBackoffMs = (attempt: number) =>
  Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));

/** Keep a durable Agent job leased for the full configured execution window. */
export function jobLeaseMs(env: NodeJS.ProcessEnv = process.env): number {
  const configuredSeconds = Number.parseInt(
    env.MEND_AGENT_MAX_RUNTIME_SECONDS ?? "1200",
    10,
  );
  const runtimeMs = Number.isFinite(configuredSeconds)
    ? Math.min(60 * 60_000, Math.max(60_000, configuredSeconds * 1_000))
    : 1_200_000;
  return runtimeMs + 60_000;
}

export class JobLeaseLostError extends Error {
  constructor(jobId: string) {
    super(`job_lease_lost:${jobId}`);
    this.name = "JobLeaseLostError";
  }
}

/** Small local adapter for tests and single-process development. Replace with a Postgres adapter at deployment. */
export class InMemoryJobStore<TPayload = Record<string, unknown>>
  implements JobStore<TPayload>
{
  private readonly jobs = new Map<string, JobRecord<TPayload>>();

  constructor(private readonly leaseMs = jobLeaseMs()) {}

  private sameDedupeScope(
    left: JobRecord<TPayload>,
    input: EnqueueJobInput<TPayload>,
  ): boolean {
    return (
      left.dedupeKey === input.dedupeKey &&
      (left.workspaceId ?? null) === (input.workspaceId ?? null) &&
      left.status !== "dead"
    );
  }

  async enqueue(
    input: EnqueueJobInput<TPayload>,
  ): Promise<JobRecord<TPayload>> {
    if (input.dedupeKey) {
      const existing = [...this.jobs.values()].find((job) =>
        this.sameDedupeScope(job, input),
      );
      if (existing) return existing;
    }
    const now = new Date();
    const job: JobRecord<TPayload> = {
      id: randomUUID(),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      type: input.type,
      payload: input.payload,
      status: "queued",
      attempts: 0,
      maxAttempts: Math.max(1, input.maxAttempts ?? 5),
      availableAt: input.availableAt ?? now,
      createdAt: now,
      updatedAt: now,
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async claim(
    workerId: string,
    now = new Date(),
  ): Promise<JobRecord<TPayload> | null> {
    const staleBefore = now.getTime() - this.leaseMs;
    for (const job of this.jobs.values()) {
      if (
        job.status === "running" &&
        job.lockedAt &&
        job.lockedAt.getTime() < staleBefore
      ) {
        job.lockedAt = undefined;
        job.lockedBy = undefined;
        job.updatedAt = now;
        if (job.attempts >= job.maxAttempts) {
          job.status = "dead";
          job.lastError = job.lastError ?? "job_lease_expired";
        } else {
          job.status = "queued";
          job.availableAt = now;
        }
      }
    }
    const candidate = [...this.jobs.values()]
      .filter(
        (job) =>
          job.status === "queued" && job.availableAt.getTime() <= now.getTime(),
      )
      .sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime())[0];
    if (!candidate) return null;
    candidate.status = "running";
    candidate.attempts += 1;
    candidate.lockedAt = now;
    candidate.lockedBy = workerId;
    candidate.updatedAt = now;
    return candidate;
  }

  async complete(
    jobId: string,
    workerId?: string,
    now = new Date(),
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`job_not_found:${jobId}`);
    if (job.status !== "running" || (workerId && job.lockedBy !== workerId))
      throw new JobLeaseLostError(jobId);
    job.status = "completed";
    job.lockedAt = undefined;
    job.lockedBy = undefined;
    job.updatedAt = now;
  }

  async fail(
    jobId: string,
    error: unknown,
    now = new Date(),
    workerId?: string,
  ): Promise<JobRecord<TPayload> | null> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`job_not_found:${jobId}`);
    if (job.status !== "running" || (workerId && job.lockedBy !== workerId))
      throw new JobLeaseLostError(jobId);
    job.lastError = redactJobError(error);
    job.lockedAt = undefined;
    job.lockedBy = undefined;
    job.updatedAt = now;
    if (job.attempts >= job.maxAttempts) {
      job.status = "dead";
      return job;
    }
    job.status = "queued";
    job.availableAt = new Date(now.getTime() + jobBackoffMs(job.attempts));
    return job;
  }

  async listDeadLetters() {
    return [...this.jobs.values()].filter((job) => job.status === "dead");
  }
  async list() {
    return [...this.jobs.values()];
  }
}

export class DebouncedJobQueue<TPayload = Record<string, unknown>> {
  private readonly timers = new Map<
    string,
    {
      timer: ReturnType<typeof setTimeout>;
      resolve: () => void;
      reject: (error: unknown) => void;
    }
  >();

  constructor(
    private readonly store: JobStore<TPayload>,
    private readonly defaultDelayMs = 1_000,
  ) {}

  schedule(
    input: EnqueueJobInput<TPayload>,
    delayMs = this.defaultDelayMs,
  ): Promise<void> {
    const key =
      input.dedupeKey ?? `${input.type}:${JSON.stringify(input.payload)}`;
    const previous = this.timers.get(key);
    if (previous) {
      clearTimeout(previous.timer);
      previous.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.timers.delete(key);
          void this.store.enqueue(input).then(() => resolve(), reject);
        },
        Math.max(0, delayMs),
      );
      this.timers.set(key, { timer, resolve, reject });
    });
  }

  cancel(key: string) {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer.timer);
      timer.resolve();
    }
    this.timers.delete(key);
  }
}
