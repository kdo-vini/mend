import { createHash } from "node:crypto";
import {
  DebouncedJobQueue,
  type EnqueueJobInput,
  type JobRecord,
  type JobStore,
} from "./jobs.js";
import {
  normalizeWhatsmiauEvent,
  type NormalizedWhatsmiauMessage,
} from "./whatsmiau.js";

export interface WhatsmiauMessageJobPayload {
  event: string;
  message: NormalizedWhatsmiauMessage;
}

export interface WhatsmiauJobOptions {
  workspaceId?: string;
  maxAttempts?: number;
}

export function messageDedupeKey(message: NormalizedWhatsmiauMessage) {
  return `whatsmiau:${message.instanceName.trim()}:${message.providerMessageId.trim()}`;
}

export async function enqueueWhatsmiauEvent(
  queue: JobStore<WhatsmiauMessageJobPayload>,
  payload: unknown,
  fallbackInstanceName: string,
  options: WhatsmiauJobOptions = {},
): Promise<JobRecord<WhatsmiauMessageJobPayload>[]> {
  const messages = normalizeWhatsmiauEvent(payload, fallbackInstanceName);
  const event =
    typeof payload === "object" &&
    payload !== null &&
    "event" in payload &&
    typeof payload.event === "string"
      ? payload.event
      : "messages.upsert";
  const jobs: JobRecord<WhatsmiauMessageJobPayload>[] = [];
  for (const message of messages) {
    const input: EnqueueJobInput<WhatsmiauMessageJobPayload> = {
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      type: "whatsmiau.message.received",
      payload: { event, message },
      dedupeKey: messageDedupeKey(message),
      maxAttempts: options.maxAttempts,
    };
    jobs.push(await queue.enqueue(input));
  }
  return jobs;
}

export interface WhatsmiauWorkerHandlers {
  onMessage: (
    message: NormalizedWhatsmiauMessage,
    job: JobRecord<WhatsmiauMessageJobPayload>,
  ) => Promise<void>;
}

export class WhatsmiauWorker {
  constructor(
    private readonly store: JobStore<WhatsmiauMessageJobPayload>,
    private readonly handlers: WhatsmiauWorkerHandlers,
    private readonly workerId = `mend-worker-${process.pid}`,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.store.claim(this.workerId);
    if (!job) return false;
    try {
      if (job.type !== "whatsmiau.message.received")
        throw new Error(`unsupported_job_type:${job.type}`);
      if (
        !job.payload?.message ||
        typeof job.payload.message.providerMessageId !== "string"
      ) {
        throw new Error("invalid_whatsmiau_message_job");
      }
      await this.handlers.onMessage(job.payload.message, job);
      await this.store.complete(job.id, this.workerId);
    } catch (error) {
      await this.store.fail(job.id, error, new Date(), this.workerId);
    }
    return true;
  }
}

export function eventDedupeKey(payload: unknown): string {
  return `whatsmiau-event:${createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32)}`;
}

/** In-memory helper used by the webhook adapter and tests; production can supply a Postgres-backed JobStore. */
export class DebouncedWhatsmiauQueue {
  private readonly queue: DebouncedJobQueue<WhatsmiauMessageJobPayload>;

  constructor(
    private readonly store: JobStore<WhatsmiauMessageJobPayload>,
    debounceMs = 1_000,
  ) {
    this.queue = new DebouncedJobQueue(store, debounceMs);
  }

  schedule(
    message: NormalizedWhatsmiauMessage,
    event = "messages.upsert",
    workspaceId?: string,
    debounceMs?: number,
  ) {
    return this.queue.schedule(
      {
        ...(workspaceId ? { workspaceId } : {}),
        type: "whatsmiau.message.received",
        payload: { event, message },
        dedupeKey: `whatsmiau:conversation:${workspaceId ?? "unscoped"}:${message.instanceName}:${message.remoteJid}`,
      },
      debounceMs,
    );
  }
}
