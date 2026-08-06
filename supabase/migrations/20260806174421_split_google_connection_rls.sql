-- Keep SELECT on the member read policy only. A FOR ALL write policy also
-- applies to SELECT and creates redundant permissive policy evaluation.
drop policy if exists "workspace managers can write Google connections"
  on public.google_connections;

create policy "workspace managers can insert Google connections"
  on public.google_connections for insert to authenticated
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));

create policy "workspace managers can update Google connections"
  on public.google_connections for update to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']))
  with check (public.workspace_can(workspace_id, array['owner', 'admin']));

create policy "workspace managers can delete Google connections"
  on public.google_connections for delete to authenticated
  using (public.workspace_can(workspace_id, array['owner', 'admin']));
