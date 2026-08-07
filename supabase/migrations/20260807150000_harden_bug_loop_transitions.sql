-- Enforce the durable loop as a forward-only state machine. The first
-- migration intentionally kept the RPC permissive while the UI and worker
-- were being wired; this replacement closes accidental jumps/regressions.
create or replace function public.advance_bug_case(
  p_workspace_id uuid,
  p_bug_case_id uuid,
  p_stage text,
  p_event_type text,
  p_message text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_status text default null,
  p_verdict text default null,
  p_decision text default null,
  p_investigation_run_id uuid default null,
  p_fix_run_id uuid default null,
  p_pr_url text default null,
  p_pr_number integer default null,
  p_merge_sha text default null,
  p_deployment_url text default null,
  p_health_status text default null,
  p_customer_response_status text default null,
  p_last_error text default null
)
returns public.bug_cases
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_case public.bug_cases;
  inserted_event_id uuid;
  stage_order constant text[] := array[
    'signal', 'suspicion', 'evidence', 'investigation', 'verdict',
    'decision', 'fix', 'verification', 'approval', 'pull_request', 'merge',
    'deploy', 'health_check', 'customer_response', 'completed', 'failed'
  ];
  current_position integer;
  next_position integer;
begin
  if p_stage <> all(stage_order) then
    raise exception 'bug_case_invalid_stage';
  end if;

  select * into current_case
  from public.bug_cases
  where id = p_bug_case_id and workspace_id = p_workspace_id
  for update;
  if current_case.id is null then
    raise exception 'bug_case_not_found';
  end if;

  -- Idempotent replays are safe even after a terminal checkpoint.
  if exists (
    select 1 from public.bug_case_events
    where bug_case_id = p_bug_case_id and idempotency_key = left(p_idempotency_key, 300)
  ) then
    return current_case;
  end if;

  current_position := array_position(stage_order, current_case.stage);
  next_position := array_position(stage_order, p_stage);
  if current_case.stage = 'completed' then
    raise exception 'bug_case_terminal';
  elsif p_stage = 'failed' then
    null; -- Any non-terminal stage may fail and await operator recovery.
  elsif p_stage = 'completed' then
    if current_case.stage <> 'customer_response' then
      raise exception 'bug_case_invalid_transition:%->%', current_case.stage, p_stage;
    end if;
  elsif p_stage = 'customer_response' and current_case.stage = 'decision' then
    if coalesce(p_decision, current_case.decision) not in ('notify', 'dismiss') then
      raise exception 'bug_case_invalid_transition:%->%', current_case.stage, p_stage;
    end if;
  elsif p_stage = 'deploy' and current_case.stage = 'pull_request' then
    -- Local-CLI publication has no GitHub merge checkpoint.
    null;
  elsif p_stage <> current_case.stage and next_position <> current_position + 1 then
    raise exception 'bug_case_invalid_transition:%->%', current_case.stage, p_stage;
  end if;

  insert into public.bug_case_events (
    workspace_id, bug_case_id, stage, event_type, message, metadata_json, idempotency_key
  ) values (
    p_workspace_id, p_bug_case_id, p_stage, left(p_event_type, 120),
    left(p_message, 2000), coalesce(p_metadata, '{}'::jsonb), left(p_idempotency_key, 300)
  ) on conflict (bug_case_id, idempotency_key) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    return current_case;
  end if;

  update public.bug_cases
  set stage = p_stage,
      status = coalesce(p_status, status),
      verdict = coalesce(p_verdict, verdict),
      decision = coalesce(p_decision, decision),
      investigation_run_id = coalesce(p_investigation_run_id, investigation_run_id),
      fix_run_id = coalesce(p_fix_run_id, fix_run_id),
      pr_url = coalesce(nullif(p_pr_url, ''), pr_url),
      pr_number = coalesce(p_pr_number, pr_number),
      merge_sha = coalesce(nullif(p_merge_sha, ''), merge_sha),
      deployment_url = coalesce(nullif(p_deployment_url, ''), deployment_url),
      health_status = coalesce(p_health_status, health_status),
      customer_response_status = coalesce(p_customer_response_status, customer_response_status),
      last_error = coalesce(nullif(left(p_last_error, 2000), ''), last_error),
      completed_at = case when coalesce(p_status, status) = 'completed' then coalesce(completed_at, now()) else completed_at end,
      updated_at = now()
  where id = p_bug_case_id and workspace_id = p_workspace_id
  returning * into current_case;

  return current_case;
end;
$$;

revoke all on function public.advance_bug_case(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, uuid, uuid,
  text, integer, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.advance_bug_case(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, uuid, uuid,
  text, integer, text, text, text, text, text
) to service_role;
