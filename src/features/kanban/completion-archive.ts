export const completedKanbanRetentionMs = 24 * 60 * 60 * 1000;

export function isCompletionArchived(
  completedAt: string | null | undefined,
  now = Date.now(),
) {
  if (!completedAt) return false;
  const completedAtMs = Date.parse(completedAt);
  return (
    !Number.isNaN(completedAtMs) &&
    completedAtMs + completedKanbanRetentionMs <= now
  );
}

export function nextCompletionArchiveAt(
  completedAt: string | null | undefined,
): number | null {
  if (!completedAt) return null;
  const completedAtMs = Date.parse(completedAt);
  return Number.isNaN(completedAtMs)
    ? null
    : completedAtMs + completedKanbanRetentionMs;
}
