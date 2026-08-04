alter table public.jobs
  add column if not exists max_attempts integer not null default 5 check (max_attempts > 0),
  add column if not exists dedupe_key text;

create unique index if not exists jobs_workspace_dedupe_key_idx
  on public.jobs (coalesce(workspace_id::text, ''), dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');

create or replace function public.claim_next_job(worker_id text, lease_seconds integer default 300)
returns setof public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with candidate as (
    select id
    from public.jobs
    where (
      (status = 'queued' and available_at <= now())
      or (status = 'running' and locked_at < now() - make_interval(secs => greatest(lease_seconds, 30)))
    )
    order by available_at asc, created_at asc
    for update skip locked
    limit 1
  )
  update public.jobs as jobs
  set status = 'running',
      attempts = jobs.attempts + 1,
      locked_at = now(),
      locked_by = worker_id,
      updated_at = now()
  from candidate
  where jobs.id = candidate.id
  returning jobs.*;
end;
$$;

revoke execute on function public.claim_next_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_next_job(text, integer) to service_role;
