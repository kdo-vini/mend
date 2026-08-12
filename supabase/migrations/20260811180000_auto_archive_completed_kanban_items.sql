-- Keep the active Kanban focused while preserving resolved issue history.

alter table public.issues
  add column if not exists completed_at timestamptz;

-- Existing completed issues predate this field. Their last update is the best
-- available completion time and lets them leave the active board immediately.
update public.issues
set completed_at = updated_at
where status = 'done'
  and completed_at is null;

create index if not exists issues_workspace_done_completed_at_idx
  on public.issues (workspace_id, completed_at)
  where status = 'done';
