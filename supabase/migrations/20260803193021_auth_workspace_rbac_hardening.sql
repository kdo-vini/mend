-- The audit trigger is only callable by PostgreSQL as a trigger function.
-- It must not be exposed through the Data API RPC surface.
revoke all on function public.audit_workspace_change() from public, anon, authenticated;
