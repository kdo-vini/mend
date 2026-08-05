drop function if exists public.update_my_workspace_member_display_name(uuid, text);

drop policy if exists "workspace members can update own display name"
  on public.workspace_members;

create policy "workspace members can update own display name"
  on public.workspace_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.workspace_members from authenticated;
grant update (display_name) on public.workspace_members to authenticated;
