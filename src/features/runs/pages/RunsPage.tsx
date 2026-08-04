import { useEffect, useRef, useState } from "react";
import { Check, FileCode2, GitBranch, RefreshCw, X } from "lucide-react";
import type { CodingRun } from "../../../types";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { SectionTitle, StatusRun } from "../../../shared/ui/DataDisplay";

export function RunsPage({
  runs,
  onOpenIssue,
  onStartRun,
  onUpdateRun,
  onRefresh,
}: {
  runs: CodingRun[];
  onOpenIssue: (id: string) => void;
  onStartRun: (id: string) => void;
  onUpdateRun: (
    runId: string,
    action: "cancel" | "approve" | "reject" | "publish" | "deploy",
  ) => void;
  onRefresh: () => void;
}) {
  const [selectedRunId, setSelectedRunId] = useState(runs[0]?.id ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];

  useEffect(
    () => () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  const refresh = () => {
    setRefreshing(true);
    onRefresh();
    refreshTimer.current = window.setTimeout(() => setRefreshing(false), 450);
  };

  if (!selectedRun)
    return (
      <div className="page">
        <PageHeader
          eyebrow="Engineering automation"
          title="Codex runs"
          description="Isolated investigations and local patches, kept inside the workspace."
          actions={
            <button
              className="button button-ghost"
              type="button"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          }
        />
        {refreshing ? (
          <LoadingState label="Refreshing Codex runs…" />
        ) : (
          <EmptyState
            title="No Codex runs yet"
            description="Start a run from an issue when engineering context is ready."
          />
        )}
      </div>
    );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Engineering automation"
        title="Codex runs"
        description="Isolated investigations and local patches, kept inside the workspace."
        actions={
          <button
            className="button button-ghost"
            type="button"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw size={15} /> {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      {refreshing ? (
        <LoadingState label="Refreshing Codex runs…" />
      ) : (
        <div className="runs-layout">
          <div className="runs-list">
            {runs.map((run) => (
              <button
                className={`run-list-row ${run.id === selectedRun.id ? "selected" : ""}`}
                type="button"
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
              >
                <div className={`run-status-dot ${run.status.toLowerCase()}`} />
                <div>
                  <div className="run-list-heading">
                    <strong>{run.issueIdentifier}</strong>
                    <span>{run.startedAt}</span>
                  </div>
                  <p>
                    {run.mode} · {run.summary}
                  </p>
                  <div className="run-list-meta">
                    <StatusRun status={run.status} />
                    <span>{run.duration}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="run-detail">
            <div className="run-detail-header">
              <div>
                <div className="page-kicker">Selected execution</div>
                <h2>
                  {selectedRun.issueIdentifier}{" "}
                  <span className="muted-separator">·</span> {selectedRun.mode}
                </h2>
                <p>{selectedRun.summary}</p>
              </div>
              <div className="run-detail-actions">
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => onOpenIssue(selectedRun.issueId)}
                >
                  Open issue
                </button>
                {selectedRun.status === "Running" && (
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => onUpdateRun(selectedRun.id, "cancel")}
                  >
                    Cancel run
                  </button>
                )}
                {selectedRun.status !== "Running" && (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => onStartRun(selectedRun.issueId)}
                  >
                    <RefreshCw size={15} /> Run again
                  </button>
                )}
              </div>
            </div>
            <div
              className="progress-line"
              role="progressbar"
              aria-label={`${selectedRun.issueIdentifier} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={selectedRun.progress}
            >
              <span style={{ width: `${selectedRun.progress}%` }} />
            </div>
            <div className="run-stat-row">
              <span>
                <strong>{selectedRun.progress}%</strong> complete
              </span>
              <span>
                <strong>{selectedRun.files.length}</strong> files changed
              </span>
              <span>
                <strong>{selectedRun.duration}</strong> runtime
              </span>
              {selectedRun.commit && (
                <span>
                  <GitBranch size={13} /> <strong>{selectedRun.commit}</strong>{" "}
                  local commit
                </span>
              )}
              {selectedRun.branch && (
                <span>
                  <GitBranch size={13} /> <strong>{selectedRun.branch}</strong>
                </span>
              )}
            </div>
            {selectedRun.status === "Completed" && (
              <div className="run-review-actions">
                <span>
                  Review the diff and checks. Approval creates the local commit;
                  publication is a separate action.
                </span>
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => onUpdateRun(selectedRun.id, "reject")}
                >
                  Reject result
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={
                    !selectedRun.diff?.trim() ||
                    selectedRun.checks?.some((check) => check.exitCode !== 0)
                  }
                  onClick={() => onUpdateRun(selectedRun.id, "approve")}
                >
                  <Check size={14} /> Approve local commit
                </button>
              </div>
            )}
            {selectedRun.status === "Approved" &&
              selectedRun.branch &&
              !selectedRun.published && (
                <div className="run-review-actions">
                  <span>
                    This branch is approved and committed locally. Publish it
                    only when you are ready for the configured remote.
                  </span>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => onUpdateRun(selectedRun.id, "publish")}
                  >
                    Publish branch
                  </button>
                </div>
              )}
            {selectedRun.status === "Approved" &&
              selectedRun.published &&
              !selectedRun.deployed && (
                <div className="run-review-actions">
                  <span>
                    The approved branch is published. Deploying is gated by the
                    workspace AI policy and Dokploy configuration.
                  </span>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => onUpdateRun(selectedRun.id, "deploy")}
                  >
                    Deploy approved branch
                  </button>
                </div>
              )}
            <section className="run-section">
              <SectionTitle title="Operational timeline" action="Live" />
              <div className="run-timeline">
                {selectedRun.events.length ? (
                  selectedRun.events.map((event, index) => (
                    <div className="run-event" key={event.id}>
                      <div className={`run-event-node ${event.tone}`}>
                        <span />
                      </div>
                      {index < selectedRun.events.length - 1 && (
                        <div className="run-event-line" />
                      )}
                      <div className="run-event-copy">
                        <div>
                          <strong>{event.detail}</strong>
                          <code>{event.label}</code>
                        </div>
                        <time>{event.time}</time>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No timeline events"
                    description="Events will appear here as the run progresses."
                  />
                )}
              </div>
            </section>
            <section className="run-section">
              <SectionTitle title="Files changed" />
              {selectedRun.files.length ? (
                <div className="file-list">
                  {selectedRun.files.map((file) => (
                    <div className="file-row" key={file}>
                      <FileCode2 size={15} />
                      <span>{file}</span>
                      <span className="file-change">modified</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No patch files"
                  description="This run did not produce a file change."
                />
              )}
            </section>
            <section className="run-section">
              <SectionTitle
                title="Reviewable diff"
                action={selectedRun.diffTruncated ? "Truncated" : undefined}
              />
              {selectedRun.diff ? (
                <pre className="diff-view" aria-label="Codex diff">
                  <code>{selectedRun.diff}</code>
                </pre>
              ) : (
                <EmptyState
                  title="No diff available"
                  description="Investigations may finish without changing a file."
                />
              )}
            </section>
            <section className="run-section">
              <SectionTitle title="Checks" />
              {selectedRun.checks?.length ? (
                <div className="check-list">
                  {selectedRun.checks.map((check, index) => (
                    <details
                      className={`check-result ${check.exitCode === 0 ? "passed" : "failed"}`}
                      key={`${check.name}-${index}`}
                    >
                      <summary>
                        <span>
                          {check.exitCode === 0 ? (
                            <Check size={14} />
                          ) : (
                            <X size={14} />
                          )}
                        </span>
                        <strong>{check.name}</strong>
                        <code>exit {check.exitCode}</code>
                      </summary>
                      <pre>{check.output || "No command output."}</pre>
                    </details>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No checks recorded"
                  description="This run did not execute an approved validation command."
                />
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
