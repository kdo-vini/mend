import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCheck,
  CheckCircle2,
  CircleDot,
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitPullRequest,
  HeartPulse,
  MessageSquare,
  RefreshCw,
  Rocket,
  SearchCheck,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import type { CodingRun } from "../../../types";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { SectionTitle, StatusRun } from "../../../shared/ui/DataDisplay";
import {
  authorizedRunActions,
  canImplementProposedFix,
  canProposeFromInvestigation,
  canRestartRun,
  type RunAction,
  type RunUpdateAction,
} from "../run-actions";
import { runEventLabelKey, selectLatestRunEvent } from "../run-events";
import { selectRun } from "../run-selection";

const stageOrder = [
  "signal",
  "suspicion",
  "evidence",
  "investigation",
  "verdict",
  "decision",
  "fix",
  "verification",
  "approval",
  "pull_request",
  "merge",
  "deploy",
  "health_check",
  "customer_response",
  "completed",
] as const;

const loopMilestones = [
  { key: "signal", lastStage: "signal", icon: CircleDot },
  { key: "suspicion", lastStage: "suspicion", icon: SearchCheck },
  { key: "evidence", lastStage: "evidence", icon: CheckCircle2 },
  { key: "investigate", lastStage: "investigation", icon: Bot },
  { key: "verdict", lastStage: "verdict", icon: ShieldCheck },
  { key: "decide", lastStage: "decision", icon: ShieldCheck },
  { key: "fix", lastStage: "fix", icon: Code2 },
  { key: "checks", lastStage: "verification", icon: CheckCheck },
  { key: "pullRequest", lastStage: "pull_request", icon: GitPullRequest },
  { key: "approval", lastStage: "approval", icon: ShieldCheck },
  { key: "merge", lastStage: "merge", icon: GitBranch },
  { key: "deploy", lastStage: "deploy", icon: Rocket },
  { key: "health", lastStage: "health_check", icon: HeartPulse },
  { key: "customer", lastStage: "completed", icon: MessageSquare },
] as const;

function RunActionButtons({
  run,
  actions,
  pending,
  onUpdateRun,
  onRetry,
}: {
  run: CodingRun;
  actions: RunAction[];
  pending: boolean;
  onUpdateRun: (runId: string, action: RunUpdateAction) => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation("runs");

  return actions.map((action) => {
    const disabled =
      pending ||
      (action === "approve" &&
        (!run.diff?.trim() ||
          run.checks?.some((check) => check.exitCode !== 0)));
    const className =
      action === "cancel"
        ? "button button-danger"
        : action === "reject"
          ? "button button-ghost"
          : "button button-primary";
    const label =
      action === "retry"
        ? run.status === "failed"
          ? t("failure.retry")
          : t("actions.runAgain")
        : t(`actions.${action}`);

    return (
      <button
        className={className}
        type="button"
        key={action}
        disabled={disabled}
        aria-busy={pending}
        onClick={() =>
          action === "retry" ? onRetry() : onUpdateRun(run.id, action)
        }
      >
        {action === "retry" && <RefreshCw size={14} />}
        {action === "approve" && <Check size={14} />}
        {label}
      </button>
    );
  });
}

function BugLoopOverview({ run }: { run: CodingRun }) {
  const { t } = useTranslation("runs");
  const isFailed =
    run.status === "failed" ||
    run.stage === "failed" ||
    run.caseStatus === "failed";
  const failureEvent = [...run.events]
    .reverse()
    .find(
      (event) =>
        event.tone === "danger" ||
        /fail|error|timeout/i.test(`${event.label} ${event.detail}`),
    );
  const fallbackStage =
    run.mode === "Investigate"
      ? "investigation"
      : run.status === "completed" || run.status === "approved"
        ? "verification"
        : "fix";
  const stage =
    run.stage === "failed" ? fallbackStage : (run.stage ?? fallbackStage);
  const activeIndex = Math.max(0, stageOrder.indexOf(stage));
  const hasRelease = Boolean(
    run.pullRequest ||
      run.mergeSha ||
      run.deploymentUrl ||
      run.healthStatus ||
      run.customerResponseStatus,
  );
  const latestEvent = selectLatestRunEvent(run.events);
  const decisionRequired =
    run.caseStatus === "awaiting_human" ||
    authorizedRunActions(run).some((action) =>
      ["approve", "reject", "merge", "deploy", "health"].includes(action),
    );

  return (
    <section className="run-loop-overview" aria-labelledby="run-loop-title">
      <div className="run-mobile-summary">
        <dl>
          <div>
            <dt>{run.issueIdentifier}</dt>
            <dd>
              <strong>{run.progress}%</strong> {t("stats.complete")}
            </dd>
          </div>
          <div>
            <dt>{t("mobile.currentStage")}</dt>
            <dd>{t(`mobile.stages.${stage}`)}</dd>
          </div>
          <div>
            <dt>{t("mobile.elapsedTime")}</dt>
            <dd>{run.duration}</dd>
          </div>
          <div>
            <dt>{t("loop.decision")}</dt>
            <dd>
              {decisionRequired
                ? t("mobile.decisionRequired")
                : t("mobile.noDecision")}
            </dd>
          </div>
          <div className="run-mobile-latest-event">
            <dt>{t("mobile.latestEvent")}</dt>
            <dd>
              {latestEvent ? (
                <>
                  <strong>
                    {t(
                      `mobile.eventLabels.${runEventLabelKey(latestEvent.label)}`,
                    )}
                  </strong>
                  <span>{latestEvent.detail}</span>
                </>
              ) : (
                t("sections.noTimeline")
              )}
            </dd>
          </div>
        </dl>
      </div>
      <div className="run-loop-heading">
        <div>
          <div className="page-kicker">{t("loop.kicker")}</div>
          <h3 id="run-loop-title">{t("loop.title")}</h3>
        </div>
        <div className="run-loop-tags">
          <span className="run-provider-tag">
            <Bot size={13} />
            {run.provider ??
              (run.caseOnly
                ? t("loop.agentPending")
                : t("loop.providerFallback"))}
            {run.providerVersion ? ` ${run.providerVersion}` : ""}
          </span>
          {run.codingStage && (
            <span className="run-case-status active">{run.codingStage}</span>
          )}
          {run.requestedModel && (
            <span className="run-provider-tag">
              {t("loop.model", { model: run.requestedModel })}
            </span>
          )}
          {run.effort && (
            <span className="run-provider-tag">
              {t("loop.effort", { effort: run.effort })}
            </span>
          )}
          {run.authMethod && (
            <span className="run-provider-tag">
              {run.authMethod === "subscription"
                ? t("loop.subscription")
                : t("loop.apiKey")}
            </span>
          )}
          {run.caseStatus && (
            <span className={`run-case-status ${run.caseStatus}`}>
              {t(`loop.caseStatus.${run.caseStatus}`)}
            </span>
          )}
        </div>
      </div>

      {isFailed && (
        <div className="run-failure-banner" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>{t("failure.title")}</strong>
            <p>{failureEvent?.detail ?? run.summary}</p>
          </div>
        </div>
      )}

      <ol
        className="run-loop-track run-loop-track-mobile"
        aria-label={t("mobile.progressLabel")}
      >
        {loopMilestones.map(({ key, lastStage, icon: Icon }, index) => {
          const lastIndex = stageOrder.indexOf(lastStage);
          const previousLastIndex =
            index === 0
              ? -1
              : stageOrder.indexOf(loopMilestones[index - 1].lastStage);
          const state =
            activeIndex > lastIndex
              ? "complete"
              : activeIndex > previousLastIndex
                ? "current"
                : "pending";
          return (
            <li
              className={state}
              key={key}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="run-loop-icon">
                {state === "complete" ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Icon size={14} />
                )}
              </span>
              <span>{t(`loop.milestones.${key}`)}</span>
            </li>
          );
        })}
      </ol>

      <div className="run-loop-facts">
        <div>
          <span>{t("loop.suspicion")}</span>
          <strong>
            {run.suspicionScore === undefined
              ? t("loop.notRecorded")
              : `${Math.round(run.suspicionScore * 100)}%`}
          </strong>
        </div>
        <div>
          <span>{t("loop.verdict")}</span>
          <strong>
            {run.verdict
              ? t(`loop.verdicts.${run.verdict}`)
              : t("loop.pending")}
          </strong>
        </div>
        <div>
          <span>{t("loop.decision")}</span>
          <strong>
            {run.decision
              ? t(`loop.decisions.${run.decision}`)
              : t("loop.pending")}
          </strong>
        </div>
      </div>

      <div className="run-loop-evidence">
        <div className="run-loop-subheading">
          <h4>{t("loop.evidenceTitle")}</h4>
          <span>{run.evidence?.length ?? 0}</span>
        </div>
        {run.evidence?.length ? (
          <div className="run-evidence-grid">
            {run.evidence.map((evidence, index) => (
              <div key={`${evidence.kind}-${evidence.label}-${index}`}>
                <code>{evidence.kind}</code>
                <strong>{evidence.label}</strong>
                {evidence.detail && <p>{evidence.detail}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="run-loop-empty">{t("loop.noEvidence")}</p>
        )}
      </div>

      {hasRelease && (
        <dl className="run-release-summary">
          <div>
            <dt>{t("loop.pullRequest")}</dt>
            <dd>
              {run.pullRequest ? (
                <a href={run.pullRequest.url} target="_blank" rel="noreferrer">
                  #{run.pullRequest.number}
                  {run.pullRequest.draft ? ` ${t("loop.draft")}` : ""}
                  <ExternalLink size={12} />
                </a>
              ) : (
                t("loop.pending")
              )}
            </dd>
          </div>
          <div>
            <dt>{t("loop.merge")}</dt>
            <dd>{run.mergeSha ?? t("loop.pending")}</dd>
          </div>
          <div>
            <dt>{t("loop.deploy")}</dt>
            <dd>
              {run.deploymentUrl ? (
                <a href={run.deploymentUrl} target="_blank" rel="noreferrer">
                  {t("loop.openDeployment")} <ExternalLink size={12} />
                </a>
              ) : (
                t("loop.pending")
              )}
            </dd>
          </div>
          <div>
            <dt>{t("loop.health")}</dt>
            <dd>{run.healthStatus ?? t("loop.pending")}</dd>
          </div>
          <div>
            <dt>{t("loop.customer")}</dt>
            <dd>{run.customerResponseStatus ?? t("loop.pending")}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

export function RunsPage({
  runs,
  onOpenIssue,
  onStartRun,
  onUpdateRun,
  pendingRunIds,
  onRefresh,
}: {
  runs: CodingRun[];
  onOpenIssue: (id: string) => void;
  onStartRun: (
    id: string,
    mode?: CodingRun["mode"],
    repositoryId?: string,
    options?: {
      stage?: "research" | "implement" | "review" | "verify";
      parentRunId?: string;
      researchArtifactId?: string;
    },
  ) => void;
  onUpdateRun: (runId: string, action: RunUpdateAction) => void;
  pendingRunIds: ReadonlySet<string>;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("runs");
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const selectedRun = selectRun(runs, searchParams.get("run"));
  const runModeLabel = (mode: CodingRun["mode"]) =>
    t(
      `common:data.runMode.${
        mode === "Investigate"
          ? "investigate"
          : mode === "Propose fix"
            ? "proposeFix"
            : "implementFix"
      }`,
    );
  const canProposeFix = selectedRun
    ? canProposeFromInvestigation(selectedRun)
    : false;
  const canImplementProposal = selectedRun
    ? canImplementProposedFix(selectedRun)
    : false;
  const hasContinuation = canProposeFix || canImplementProposal;
  const hasSecondaryRetry = selectedRun ? canRestartRun(selectedRun) : false;
  const authorizedActions = selectedRun
    ? authorizedRunActions(selectedRun)
    : [];
  const runActionPending = selectedRun
    ? pendingRunIds.has(selectedRun.id)
    : false;

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

  const mobileActions = authorizedActions.filter(
    (action) => action !== "publish",
  );
  const runActionButtonProps = {
    run: selectedRun,
    pending: runActionPending,
    onUpdateRun,
    onRetry: () => onStartRun(selectedRun.issueId),
  };

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
                aria-pressed={run.id === selectedRun.id}
                onClick={() => {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.set("run", run.id);
                  setSearchParams(nextParams);
                }}
              >
                <div className={`run-status-dot ${run.status.toLowerCase()}`} />
                <div>
                  <div className="run-list-heading">
                    <strong>{run.issueIdentifier}</strong>
                    <span>{run.startedAt}</span>
                  </div>
                  <p>
                    {run.caseOnly
                      ? t("loop.caseRecord")
                      : runModeLabel(run.mode)}{" "}
                    · {run.summary}
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
                <div className="page-kicker">
                  {selectedRun.caseOnly
                    ? t("loop.selectedCase")
                    : t("loop.selectedExecution")}
                </div>
                <h2>
                  {selectedRun.issueIdentifier}{" "}
                  <span className="muted-separator">·</span>{" "}
                  {runModeLabel(selectedRun.mode)}
                </h2>
                <p>{selectedRun.summary}</p>
              </div>
              <div className="run-detail-actions">
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => onOpenIssue(selectedRun.issueId)}
                >
                  {t("actions.openIssue")}
                </button>
                {selectedRun.caseOnly ? (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => onStartRun(selectedRun.issueId)}
                  >
                    <Bot size={15} /> {t("loop.startInvestigation")}
                  </button>
                ) : authorizedActions.includes("cancel") ? (
                  <span className="run-desktop-decision">
                    <RunActionButtons
                      {...runActionButtonProps}
                      actions={["cancel"]}
                    />
                  </span>
                ) : hasSecondaryRetry ? (
                  <span className="run-desktop-decision">
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => onStartRun(selectedRun.issueId)}
                    >
                      <RefreshCw size={15} /> {t("actions.runAgain")}
                    </button>
                  </span>
                ) : null}
              </div>
            </div>
            <BugLoopOverview run={selectedRun} />
            {mobileActions.length > 0 && (
              <div
                className="run-mobile-decision-bar"
                aria-busy={runActionPending}
              >
                <span>{t("mobile.nextAuthorizedAction")}</span>
                <div>
                  <RunActionButtons
                    {...runActionButtonProps}
                    actions={mobileActions}
                  />
                </div>
              </div>
            )}
            {hasContinuation && (
              <div className="run-review-actions run-implement-actions">
                <span>
                  {canProposeFix
                    ? t("actions.continueInvestigationDescription")
                    : t("actions.implementDescription")}
                </span>
                <div className="run-detail-actions">
                  {canProposeFix && (
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={() =>
                        onStartRun(
                          selectedRun.issueId,
                          "Propose fix",
                          selectedRun.repositoryId,
                          {
                            stage: "research",
                            parentRunId: selectedRun.id,
                            researchArtifactId: selectedRun.researchArtifactId!,
                          },
                        )
                      }
                    >
                      <Code2 size={14} /> {t("actions.propose")}
                    </button>
                  )}
                  {canImplementProposal && (
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() =>
                        onStartRun(
                          selectedRun.issueId,
                          "Implement fix",
                          selectedRun.repositoryId,
                          {
                            stage: "implement",
                            parentRunId: selectedRun.id,
                            researchArtifactId: selectedRun.researchArtifactId!,
                          },
                        )
                      }
                    >
                      <Wrench size={14} /> {t("actions.implement")}
                    </button>
                  )}
                </div>
              </div>
            )}
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
                <strong>{selectedRun.progress}%</strong> {t("stats.complete")}
              </span>
              {!selectedRun.caseOnly && (
                <>
                  <span>
                    <strong>{selectedRun.files.length}</strong>{" "}
                    {t("stats.filesChanged")}
                  </span>
                  <span>
                    <strong>{selectedRun.duration}</strong> {t("stats.runtime")}
                  </span>
                </>
              )}
              {selectedRun.commit && (
                <span>
                  <GitBranch size={13} /> <strong>{selectedRun.commit}</strong>{" "}
                  {t("stats.localCommit")}
                </span>
              )}
              {selectedRun.branch && (
                <span>
                  <GitBranch size={13} /> <strong>{selectedRun.branch}</strong>
                </span>
              )}
              {selectedRun.realModel && (
                <span>
                  <strong>{selectedRun.realModel}</strong>{" "}
                  {t("stats.modelUsed")}
                </span>
              )}
              {selectedRun.usage?.totalTokens !== undefined && (
                <span>
                  <strong>{selectedRun.usage.totalTokens}</strong>{" "}
                  {t("stats.tokens")}
                </span>
              )}
              {selectedRun.usage?.cost && (
                <span>
                  <strong>
                    {selectedRun.usage.cost.amountUsd === undefined
                      ? selectedRun.usage.cost.method
                      : `$${selectedRun.usage.cost.amountUsd.toFixed(4)}`}
                  </strong>{" "}
                  {t("stats.cost")}
                </span>
              )}
            </div>
            {selectedRun.attempts && selectedRun.attempts.length > 0 && (
              <div className="run-attempts" aria-label={t("stats.attempts")}>
                {selectedRun.attempts.map((attempt) => (
                  <span key={attempt.attemptNumber}>
                    #{attempt.attemptNumber}{" "}
                    {attempt.provider ?? t("stats.provider")}
                    {attempt.requestedModel
                      ? " · " + attempt.requestedModel
                      : ""}{" "}
                    · {attempt.status}
                    {attempt.errorCategory ? " · " + attempt.errorCategory : ""}
                  </span>
                ))}
              </div>
            )}
            {authorizedActions.includes("approve") && (
              <div className="run-review-actions run-desktop-decision">
                <span>{t("actions.reviewDescription")}</span>
                <RunActionButtons
                  {...runActionButtonProps}
                  actions={["reject", "approve"]}
                />
              </div>
            )}
            {authorizedActions.includes("retry") &&
              selectedRun.status === "failed" && (
                <div className="run-review-actions run-failure-actions run-desktop-decision">
                  <span>{t("failure.retryDescription")}</span>
                  <RunActionButtons
                    {...runActionButtonProps}
                    actions={["retry"]}
                  />
                </div>
              )}
            {selectedRun.decision === "notify" && (
              <div className="run-review-actions run-notify-actions">
                <span>{t("actions.notifyDescription")}</span>
              </div>
            )}
            {authorizedActions.includes("publish") && (
              <div className="run-review-actions">
                <span>{t("actions.publishDescription")}</span>
                <RunActionButtons
                  {...runActionButtonProps}
                  actions={["publish"]}
                />
              </div>
            )}
            {authorizedActions.includes("merge") && (
              <div className="run-review-actions run-desktop-decision">
                <span>{t("actions.mergeDescription")}</span>
                <RunActionButtons
                  {...runActionButtonProps}
                  actions={["merge"]}
                />
              </div>
            )}
            {authorizedActions.includes("deploy") && (
              <div className="run-review-actions run-desktop-decision">
                <span>{t("actions.deployDescription")}</span>
                <RunActionButtons
                  {...runActionButtonProps}
                  actions={["deploy"]}
                />
              </div>
            )}
            {authorizedActions.includes("health") && (
              <div className="run-review-actions run-desktop-decision">
                <span>{t("actions.healthDescription")}</span>
                <RunActionButtons
                  {...runActionButtonProps}
                  actions={["health"]}
                />
              </div>
            )}
            <section className="run-section">
              <SectionTitle
                title={t("sections.timeline")}
                action={t("sections.live")}
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
                    title={t("sections.noTimeline")}
                    description={t("sections.noTimelineDescription")}
                  />
                )}
              </div>
            </section>
            {!selectedRun.caseOnly && (
              <>
                <section className="run-section">
                  <SectionTitle title={t("sections.filesChanged")} />
                  {selectedRun.files.length ? (
                    <div className="file-list">
                      {selectedRun.files.map((file) => (
                        <div className="file-row" key={file}>
                          <FileCode2 size={15} />
                          <span>{file}</span>
                          <span className="file-change">
                            {t("loop.fileChange")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title={t("sections.noPatchFiles")}
                      description={t("sections.noPatchFilesDescription")}
                    />
                  )}
                </section>
                <section className="run-section">
                  <SectionTitle
                    title={t("sections.reviewableDiff")}
                    action={
                      selectedRun.diffTruncated
                        ? t("sections.truncated")
                        : undefined
                    }
                  />
                  {selectedRun.diff ? (
                    <pre
                      className="diff-view"
                      aria-label={t("loop.diffAriaLabel")}
                    >
                      <code>{selectedRun.diff}</code>
                    </pre>
                  ) : (
                    <EmptyState
                      title={t("sections.noDiff")}
                      description={t("sections.noDiffDescription")}
                    />
                  )}
                </section>
                <section className="run-section">
                  <SectionTitle title={t("sections.checks")} />
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
                          <pre>{check.output || t("loop.noCommandOutput")}</pre>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title={t("sections.noChecks")}
                      description={t("sections.noChecksDescription")}
                    />
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
