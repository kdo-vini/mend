export const codexRunEventTypes = [
  "run_queued",
  "run_started",
  "sandbox_ready",
  "tool_started",
  "tool_completed",
  "progress",
  "diff_ready",
  "run_completed",
  "run_failed",
  "run_canceled",
  "cleanup_failed",
] as const;

export type CodexRunEventType = (typeof codexRunEventTypes)[number];

export interface CodexRunEventInput {
  eventType: CodexRunEventType;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface CodexRunEvent extends CodexRunEventInput {
  id: string;
  runId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CodexEventSink {
  publish(event: CodexRunEvent): Promise<void>;
}

export type CodexEventListener = (event: CodexRunEvent) => void | Promise<void>;

export interface CodexEventHub extends CodexEventSink {
  subscribe(listener: CodexEventListener): () => void;
}

export function createCodexEventHub(): CodexEventHub {
  const listeners = new Set<CodexEventListener>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async publish(event) {
      await Promise.all(
        [...listeners].map(async (listener) => {
          try {
            await listener(event);
          } catch {
            /* observer failures cannot stop the run */
          }
        }),
      );
    },
  };
}
