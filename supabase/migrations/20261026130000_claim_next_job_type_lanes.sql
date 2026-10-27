-- Job lanes: let a worker claim only (or everything except) some job types so
-- inbound message jobs never queue behind long agent/knowledge jobs. Both new
-- parameters default to null, so existing two-argument callers keep working.
drop function if exists public.claim_next_job(text, integer);
drop function if exists private.claim_next_job(text, integer);

create or replace function private.claim_next_job(
  worker_id text,
  lease_seconds integer default 300,
  include_types text[] default null,
  exclude_types text[] default null
)
returns setof public.jobs
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if nullif(btrim(worker_id), '') is null then
    raise exception 'worker_id_required';
  end if;

  update public.jobs
  set status = 'dead',
      locked_at = null,
      locked_by = null,
      lease_expires_at = null,
      dead_at = coalesce(dead_at, now()),
      last_error = coalesce(last_error, 'job_lease_expired'),
      updated_at = now()
  where status = 'running'
    and coalesce(lease_expires_at, locked_at + make_interval(secs => greatest(lease_seconds, 30))) <= now()
    and attempts >= coalesce(max_attempts, 5);

  return query
  with candidate as (
    select id
    from public.jobs
    where (
      (status = 'queued' and available_at <= now())
      or (
        status = 'running'
        and coalesce(lease_expires_at, locked_at + make_interval(secs => greatest(lease_seconds, 30))) <= now()
        and attempts < coalesce(max_attempts, 5)
      )
    )
      and (include_types is null or type = any(include_types))
      and (exclude_types is null or not (type = any(exclude_types)))
    order by available_at asc, created_at asc
    for update skip locked
    limit 1
  )
  update public.jobs as jobs
  set status = 'running',
      attempts = jobs.attempts + 1,
      locked_at = now(),
      locked_by = worker_id,
      lease_expires_at = now() + make_interval(secs => greatest(lease_seconds, 30)),
      dead_at = null,
      updated_at = now()
  from candidate
  where jobs.id = candidate.id
  returning jobs.*;
end;
$$;

create or replace function public.claim_next_job(
  worker_id text,
  lease_seconds integer default 300,
  include_types text[] default null,
  exclude_types text[] default null
)
returns setof public.jobs
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select * from private.claim_next_job($1, $2, $3, $4); $$;

revoke all on function private.claim_next_job(text, integer, text[], text[]) from public, anon, authenticated;
grant execute on function private.claim_next_job(text, integer, text[], text[]) to service_role;
revoke all on function public.claim_next_job(text, integer, text[], text[]) from public, anon, authenticated;
grant execute on function public.claim_next_job(text, integer, text[], text[]) to service_role;
