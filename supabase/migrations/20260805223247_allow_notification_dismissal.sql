grant delete on table public.notifications to authenticated;

create policy "workspace members can delete notifications"
  on public.notifications for delete to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (user_id is null or user_id = (select auth.uid()))
  );
