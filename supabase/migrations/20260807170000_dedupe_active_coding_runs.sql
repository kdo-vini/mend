-- Keep one active coding run per workspace/issue/mode.  The continuation
-- worker is intentionally retryable, so two workers must converge on the
-- same queued/running run instead of dispatching two CLIs for one complaint.
-- Older databases may already contain a race-created duplicate; retain the
-- newest run and make the older active copies explicit failures before the
-- unique index is installed.
with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id, issue_id, mode
      order by (status = 'running') desc, created_at desc, id desc
    ) as duplicate_rank
  from public.coding_runs
  where status in ('queued', 'running')
), stale as (
  select id from ranked where duplicate_rank > 1
)
update public.coding_runs as runs
set status = 'failed',
    finished_at = coalesce(finished_at, now()),
    result_json = case
      when jsonb_typeof(result_json) = 'object' then
        result_json || jsonb_build_object(
          'error', 'duplicate_active_coding_run_reconciled',
          'reconciledAt', now()
        )
      else jsonb_build_object(
        'error', 'duplicate_active_coding_run_reconciled',
        'reconciledAt', now()
      )
    end,
    updated_at = now()
where runs.id in (select id from stale);

create unique index if not exists coding_runs_active_issue_mode_idx
  on public.coding_runs (workspace_id, issue_id, mode)
  where status in ('queued', 'running');
