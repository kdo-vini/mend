import type { RunEvent } from "../../types";

const eventLabelKeys: Record<string, string> = {
  repository_prepared: "repositoryPrepared",
  search_performed: "searchPerformed",
  analysis_started: "analysisStarted",
  file_read: "fileRead",
  commit_created: "commitCreated",
  tests_completed: "testsCompleted",
  diff_ready: "diffReady",
  run_queued: "runQueued",
  run_started: "runStarted",
  run_fallback: "runFallback",
  sandbox_ready: "sandboxReady",
  tool_started: "toolStarted",
  tool_completed: "toolCompleted",
  progress: "progress",
  run_completed: "runCompleted",
  run_failed: "runFailed",
  run_canceled: "runCanceled",
  cleanup_failed: "cleanupFailed",
};

function eventTimestamp(event: RunEvent, fallback: number): number {
  if (event.occurredAt) {
    const canonical = Date.parse(event.occurredAt);
    if (Number.isFinite(canonical)) return canonical;
  }
  const clock = event.time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!clock) return fallback;
  return (
    Number(clock[1]) * 60 * 60 + Number(clock[2]) * 60 + Number(clock[3] ?? 0)
  );
}

export function selectLatestRunEvent(events: RunEvent[]): RunEvent | null {
  let latest: RunEvent | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  events.forEach((event, index) => {
    const timestamp = eventTimestamp(event, index);
    if (timestamp < latestTimestamp) return;
    latest = event;
    latestTimestamp = timestamp;
  });
  return latest;
}

export function runEventLabelKey(label: string): string {
  return eventLabelKeys[label] ?? "other";
}
