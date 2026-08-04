-- Techne's production-safe automation profile:
-- triage and notifications are active, Codex may prepare fixes automatically,
-- but publication/deployment always remains behind an explicit human action.
update public.workspaces
set ai_policy_json = coalesce(ai_policy_json, '{}'::jsonb) || jsonb_build_object(
  'notify_on_bug', true,
  'bug_auto_fix_enabled', true,
  'bug_auto_deploy_enabled', false,
  'bug_auto_reply_enabled', false
)
where id = '0de88c1f-bb26-4fbc-bc65-f01a434eadda';

insert into public.repositories (
  workspace_id,
  name,
  local_path,
  default_branch,
  allowed_commands
)
select
  '0de88c1f-bb26-4fbc-bc65-f01a434eadda',
  'TechneOS',
  '/workspace/repos/techneOS',
  'main',
  jsonb_build_array('install', 'lint', 'test', 'build')
where not exists (
  select 1
  from public.repositories
  where workspace_id = '0de88c1f-bb26-4fbc-bc65-f01a434eadda'
    and name = 'TechneOS'
);
