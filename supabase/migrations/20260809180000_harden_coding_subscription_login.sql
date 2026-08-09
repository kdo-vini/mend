-- Keep subscription login state transitions durable and race-safe.
alter table public.agent_connections
  drop constraint if exists agent_connections_status_check,
  add constraint agent_connections_status_check
    check (status in ('pending', 'connected', 'expired', 'revoked', 'error', 'canceled'));

-- Only one active device-login challenge may exist for a user/provider in a
-- workspace. Terminal jobs remain available for audit and troubleshooting.
with duplicate_jobs as (
  select
    id,
    connection_id,
    row_number() over (
      partition by workspace_id, user_id, provider
      order by created_at asc, id asc
    ) as position
  from public.agent_connection_auth_jobs
  where status in ('pending', 'awaiting_user')
), reconciled_jobs as (
  update public.agent_connection_auth_jobs jobs
  set
    status = 'canceled',
    error_code = 'duplicate_active_login_reconciled',
    updated_at = now()
  from duplicate_jobs duplicates
  where jobs.id = duplicates.id
    and duplicates.position > 1
  returning jobs.connection_id
)
update public.agent_connections connections
set
  status = 'canceled',
  automation_consent = false,
  updated_at = now()
from reconciled_jobs
where connections.id = reconciled_jobs.connection_id;

create unique index if not exists agent_connection_auth_jobs_active_idx
  on public.agent_connection_auth_jobs (workspace_id, user_id, provider)
  where status in ('pending', 'awaiting_user');

create or replace function public.complete_agent_subscription_login(
  p_job_id uuid,
  p_connection_id uuid,
  p_encrypted_bundle text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  connection_updated boolean;
begin
  update public.agent_connection_auth_jobs
  set status = 'completed', updated_at = now()
  where id = p_job_id
    and connection_id = p_connection_id
    and status in ('pending', 'awaiting_user');

  if not found then
    return false;
  end if;

  update public.agent_connections
  set
    status = 'connected',
    automation_consent = false,
    updated_at = now()
  where id = p_connection_id
    and status = 'pending';

  connection_updated := found;
  if not connection_updated then
    update public.agent_connection_auth_jobs
    set
      status = 'canceled',
      error_code = coalesce(error_code, 'login_connection_not_pending'),
      updated_at = now()
    where id = p_job_id
      and status = 'completed';
    return false;
  end if;

  insert into public.agent_connection_secrets (
    connection_id,
    encrypted_bundle,
    updated_at
  ) values (
    p_connection_id,
    p_encrypted_bundle,
    now()
  )
  on conflict (connection_id) do update
    set encrypted_bundle = excluded.encrypted_bundle,
        updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke execute on function public.complete_agent_subscription_login(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_agent_subscription_login(uuid, uuid, text)
  to service_role;
