-- Agent keys: let workspace owners/admins edit the scopes of an ACTIVE key, so
-- a bot can gain permissions (e.g. clientes:ler) without a new key. Policies
-- are permissive and combine with OR, but both require the existing row to be
-- active (revoked_at is null) in `using`, so a revoked key can never be edited
-- or un-revoked. Column grants keep every other column read-only for
-- authenticated users; the scopes cardinality check stays on the column.
grant update(scopes) on public.agent_api_keys to authenticated;
create policy agent_api_keys_edit_scopes on public.agent_api_keys for update to authenticated
  using(private.workspace_member_role(workspace_id) in ('owner','admin') and revoked_at is null)
  with check(private.workspace_member_role(workspace_id) in ('owner','admin') and revoked_at is null);
