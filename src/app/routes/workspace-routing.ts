export type IssueWorkspaceView = "list" | "board";

export function issueWorkspaceView(search: string): IssueWorkspaceView {
  return new URLSearchParams(search).get("view") === "board" ? "board" : "list";
}

export function issueViewHref(
  view: IssueWorkspaceView,
  search: string,
): string {
  const params = new URLSearchParams(search);
  if (view === "board") params.set("view", "board");
  else params.delete("view");
  const query = params.toString();
  return `/issues${query ? `?${query}` : ""}`;
}

export function legacyKanbanDestination(search: string): string {
  const params = new URLSearchParams(search);
  const personal = params.get("mode") === "personal";
  params.delete("mode");
  if (!personal) params.set("view", "board");
  else params.delete("view");
  const query = params.toString();
  return `${personal ? "/my-work" : "/issues"}${query ? `?${query}` : ""}`;
}
