-- Browser writes must never fail just because they omitted the audit actor.
-- auth.uid() is derived from the request JWT; an explicitly supplied actor is
-- still checked by RLS and cannot be impersonated.
alter table public.audit_log
  alter column actor_user_id set default auth.uid();

-- Workspace AI policy saves are audited in the same transaction as the update.
-- This also prevents the client from needing a second, independently scoped
-- audit insert after the workspace update succeeds.
create or replace function public.audit_workspace_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  audit_action text;
  audit_metadata jsonb;
begin
  if tg_op = 'UPDATE' and new.ai_policy_json is distinct from old.ai_policy_json then
    audit_action := 'ai.policy_updated';
    audit_metadata := jsonb_build_object(
      'name', new.name,
      'slug', new.slug,
      'policy', new.ai_policy_json
    );
  else
    audit_action := case
      when tg_op = 'INSERT' then 'workspace.created'
      when tg_op = 'UPDATE' then 'workspace.updated'
      else 'workspace.deleted'
    end;
    audit_metadata := jsonb_build_object(
      'name', coalesce(new.name, old.name),
      'slug', coalesce(new.slug, old.slug)
    );
  end if;

  insert into public.audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata_json
  ) values (
    coalesce(new.id, old.id),
    (select auth.uid()),
    audit_action,
    'workspace',
    coalesce(new.id, old.id),
    audit_metadata
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_workspace_change() from public, anon, authenticated;
