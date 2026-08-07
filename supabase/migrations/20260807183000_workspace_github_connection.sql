-- GitHub App installations belong to the Mend workspace, not to a single
-- repository. Repository rows keep their selected owner/repo for execution,
-- while the workspace owns the installation lifecycle.
alter table public.workspaces
  add column if not exists github_installation_id text,
  add column if not exists github_owner text,
  add column if not exists github_connected_at timestamptz;

alter table public.workspaces
  drop constraint if exists workspaces_github_installation_id_format;

alter table public.workspaces
  add constraint workspaces_github_installation_id_format
  check (
    github_installation_id is null
    or github_installation_id ~ '^[0-9]{1,20}$'
  );

alter table public.workspaces
  drop constraint if exists workspaces_github_owner_format;

alter table public.workspaces
  add constraint workspaces_github_owner_format
  check (
    github_owner is null
    or github_owner ~ '^[A-Za-z0-9_.-]{1,100}$'
  );

-- Preserve installations created by the first per-repository GitHub flow.
update public.workspaces as workspace
set
  github_installation_id = repository.github_installation_id,
  github_owner = repository.github_owner,
  github_connected_at = coalesce(workspace.github_connected_at, now()),
  updated_at = now()
from public.repositories as repository
where workspace.id = repository.workspace_id
  and workspace.github_installation_id is null
  and repository.github_installation_id is not null
  and repository.github_owner is not null;
