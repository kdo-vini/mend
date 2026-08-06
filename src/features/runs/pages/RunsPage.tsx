import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["runs", "common"]);
  const modeLabel = (mode: CodingRun["mode"]) =>
    mode === "Investigate"
      ? t("data.runMode.investigate", { ns: "common" })
      : mode === "Propose fix"
        ? t("data.runMode.proposeFix", { ns: "common" })
        : t("data.runMode.implementFix", { ns: "common" });
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
          eyebrow={t("ui.eyebrow")}
          title={t("title")}
          description={t("ui.description")}
          actions={
            <button
              className="button button-ghost"
              type="button"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCw size={15} /> {t("ui.refresh")}
            </button>
          }
        />
        {refreshing ? (
          <LoadingState label={t("ui.refreshing")} />
        ) : (
          <EmptyState
            title={t("empty")}
            description={t("ui.emptyDescription")}
          />
        )}
      </div>
    );

  return (
    <div className="page">
      <PageHeader
        eyebrow={t("ui.eyebrow")}
        title={t("title")}
        description={t("ui.description")}
        actions={
          <button
            className="button button-ghost"
            type="button"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw size={15} />{" "}
            {refreshing ? t("ui.refreshing") : t("ui.refresh")}
          </button>
        }
      />
      {refreshing ? (
        <LoadingState label={t("ui.refreshing")} />
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
                    {modeLabel(run.mode)} · {run.summary}
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
                <div className="page-kicker">{t("detail.selected")}</div>
                <h2>
                  {selectedRun.issueIdentifier}{" "}
                  <span className="muted-separator">·</span>{" "}
                  {modeLabel(selectedRun.mode)}
                </h2>
                <p>{selectedRun.summary}</p>
              </div>
              <div className="run-detail-actions">
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => onOpenIssue(selectedRun.issueId)}
                >
                  {t("detail.openIssue")}
                </button>
                {selectedRun.status === "Running" && (
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => onUpdateRun(selectedRun.id, "cancel")}
                  >
                    {t("detail.cancelRun")}
                  </button>
                )}
                {selectedRun.status !== "Running" && (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => onStartRun(selectedRun.issueId)}
                  >
                    <RefreshCw size={15} /> {t("detail.runAgain")}
                  </button>
                )}
              </div>
            </div>
            <div
              className="progress-line"
              role="progressbar"
              aria-label={t("detail.progress", {
                identifier: selectedRun.issueIdentifier,
              })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={selectedRun.progress}
            >
              <span style={{ width: `${selectedRun.progress}%` }} />
            </div>
            <div className="run-stat-row">
              <span>
                <strong>{selectedRun.progress}%</strong> {t("detail.complete")}
              </span>
              <span>
                <strong>{selectedRun.files.length}</strong>{" "}
                {t("detail.filesChanged")}
              </span>
              <span>
                <strong>{selectedRun.duration}</strong> {t("detail.runtime")}
              </span>
              {selectedRun.commit && (
                <span>
                  <GitBranch size={13} /> <strong>{selectedRun.commit}</strong>{" "}
                  {t("detail.localCommit")}
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
                <span>{t("detail.reviewDescription")}</span>
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => onUpdateRun(selectedRun.id, "reject")}
                >
                  {t("detail.rejectResult")}
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
                  <Check size={14} /> {t("detail.approveCommit")}
                </button>
              </div>
            )}
            {selectedRun.status === "Approved" &&
              selectedRun.branch &&
              !selectedRun.published && (
                <div className="run-review-actions">
                  <span>{t("detail.publishDescription")}</span>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => onUpdateRun(selectedRun.id, "publish")}
                  >
                    {t("detail.publishBranch")}
                  </button>
                </div>
              )}
            {selectedRun.status === "Approved" &&
              selectedRun.published &&
              !selectedRun.deployed && (
                <div className="run-review-actions">
                  <span>{t("detail.deployDescription")}</span>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => onUpdateRun(selectedRun.id, "deploy")}
                  >
                    {t("detail.deployBranch")}
                  </button>
                </div>
              )}
            <section className="run-section">
              <SectionTitle
                title={t("detail.timeline")}
                action={t("detail.live")}
              />
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
                    title={t("detail.noTimeline")}
                    description={t("detail.noTimelineDescription")}
                  />
                )}
              </div>
            </section>
            <section className="run-section">
              <SectionTitle title={t("detail.filesChangedTitle")} />
              {selectedRun.files.length ? (
                <div className="file-list">
                  {selectedRun.files.map((file) => (
                    <div className="file-row" key={file}>
                      <FileCode2 size={15} />
                      <span>{file}</span>
                      <span className="file-change">
                        {t("detail.modified")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={t("detail.noPatchFiles")}
                  description={t("detail.noPatchFilesDescription")}
                />
              )}
            </section>
            <section className="run-section">
              <SectionTitle
                title={t("detail.reviewableDiff")}
                action={
                  selectedRun.diffTruncated ? t("detail.truncated") : undefined
                }
              />
              {selectedRun.diff ? (
                <pre
                  className="diff-view"
                  aria-label={t("detail.diffAriaLabel")}
                >
                  <code>{selectedRun.diff}</code>
                </pre>
              ) : (
                <EmptyState
                  title={t("detail.noDiff")}
                  description={t("detail.noDiffDescription")}
                />
              )}
            </section>
            <section className="run-section">
              <SectionTitle title={t("detail.checks")} />
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
                      <pre>{check.output || t("detail.noCommandOutput")}</pre>
                    </details>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={t("detail.noChecksRecorded")}
                  description={t("detail.noChecksDescription")}
                />
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
