-- Record retries separately from initial invitation creation. Delivery runs
-- with the service role, so actor_user_id is intentionally null for this
-- system event; the invitation's invited_by field remains in metadata.
create or replace function private.record_workspace_invitation_delivery(
  p_invitation_id uuid,
  p_status text,
  p_kind text default null,
  p_error_code text default null
)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  invitation public.workspace_invitations;
  was_sent boolean;
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid_invitation_delivery_status';
  end if;
  if p_kind is not null and p_kind not in ('invite', 'recovery') then
    raise exception 'invalid_invitation_delivery_kind';
  end if;

  select * into invitation
  from public.workspace_invitations
  where id = p_invitation_id
    and accepted_at is null
    and revoked_at is null
  for update;
  if invitation.id is null then
    raise exception 'workspace_invitation_not_found' using errcode = '22023';
  end if;
  was_sent := invitation.sent_at is not null;

  update public.workspace_invitations
  set delivery_status = p_status,
    delivery_kind = coalesce(p_kind, delivery_kind),
    last_error_code = p_error_code,
    sent_at = case when p_status = 'sent' then timezone('utc', now()) else sent_at end,
    expires_at = case when p_status = 'sent' then timezone('utc', now()) + interval '1 hour' else expires_at end,
    updated_at = timezone('utc', now())
  where id = invitation.id
  returning * into invitation;

  if was_sent then
    insert into public.audit_log (
      workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
    ) values (
      invitation.workspace_id, null, 'workspace.invitation_resent',
      'workspace_invitation', invitation.id,
      jsonb_build_object(
        'email', invitation.email,
        'status', p_status,
        'delivery_kind', invitation.delivery_kind,
        'error_code', p_error_code,
        'invited_by', invitation.invited_by
      )
    );
  end if;

  return invitation;
end;
$$;
