-- Keep the implementation of invitation RPCs out of the exposed API schema.
-- Public invoker wrappers preserve the browser/Supabase RPC contract while
-- the private security-definer bodies enforce the workspace boundary.

alter function public.list_workspace_members_with_email(uuid) set schema private;
alter function public.create_workspace_invitation(uuid, text, text) set schema private;
alter function public.update_workspace_invitation(uuid, uuid, text) set schema private;
alter function public.revoke_workspace_invitation(uuid, uuid) set schema private;
alter function public.record_workspace_invitation_delivery(uuid, text, text, text) set schema private;
alter function public.accept_workspace_invitation(uuid) set schema private;

revoke all on function private.list_workspace_members_with_email(uuid)
  from public, anon;
grant execute on function private.list_workspace_members_with_email(uuid)
  to authenticated;

revoke all on function private.create_workspace_invitation(uuid, text, text)
  from public, anon;
grant execute on function private.create_workspace_invitation(uuid, text, text)
  to authenticated;

revoke all on function private.update_workspace_invitation(uuid, uuid, text)
  from public, anon;
grant execute on function private.update_workspace_invitation(uuid, uuid, text)
  to authenticated;

revoke all on function private.revoke_workspace_invitation(uuid, uuid)
  from public, anon;
grant execute on function private.revoke_workspace_invitation(uuid, uuid)
  to authenticated;

revoke all on function private.record_workspace_invitation_delivery(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function private.record_workspace_invitation_delivery(uuid, text, text, text)
  to service_role;

revoke all on function private.accept_workspace_invitation(uuid)
  from public, anon;
grant execute on function private.accept_workspace_invitation(uuid)
  to authenticated;

create function public.list_workspace_members_with_email(p_workspace_id uuid)
returns table (
  id uuid,
  user_id uuid,
  workspace_id uuid,
  role text,
  display_name text,
  email text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$ select * from private.list_workspace_members_with_email($1); $$;

create function public.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role text default 'agent'
)
returns public.workspace_invitations
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.create_workspace_invitation($1, $2, $3); $$;

create function public.update_workspace_invitation(
  p_workspace_id uuid,
  p_invitation_id uuid,
  p_role text
)
returns public.workspace_invitations
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.update_workspace_invitation($1, $2, $3); $$;

create function public.revoke_workspace_invitation(
  p_workspace_id uuid,
  p_invitation_id uuid
)
returns boolean
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.revoke_workspace_invitation($1, $2); $$;

create function public.record_workspace_invitation_delivery(
  p_invitation_id uuid,
  p_status text,
  p_kind text default null,
  p_error_code text default null
)
returns public.workspace_invitations
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.record_workspace_invitation_delivery($1, $2, $3, $4); $$;

create function public.accept_workspace_invitation(p_invitation_id uuid)
returns public.workspace_members
language sql
volatile
security invoker
set search_path = pg_catalog, public, private
as $$ select private.accept_workspace_invitation($1); $$;

revoke all on function public.list_workspace_members_with_email(uuid)
  from public, anon;
grant execute on function public.list_workspace_members_with_email(uuid)
  to authenticated;

revoke all on function public.create_workspace_invitation(uuid, text, text)
  from public, anon;
grant execute on function public.create_workspace_invitation(uuid, text, text)
  to authenticated;

revoke all on function public.update_workspace_invitation(uuid, uuid, text)
  from public, anon;
grant execute on function public.update_workspace_invitation(uuid, uuid, text)
  to authenticated;

revoke all on function public.revoke_workspace_invitation(uuid, uuid)
  from public, anon;
grant execute on function public.revoke_workspace_invitation(uuid, uuid)
  to authenticated;

revoke all on function public.record_workspace_invitation_delivery(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_workspace_invitation_delivery(uuid, text, text, text)
  to service_role;

revoke all on function public.accept_workspace_invitation(uuid)
  from public, anon;
grant execute on function public.accept_workspace_invitation(uuid)
  to authenticated;
