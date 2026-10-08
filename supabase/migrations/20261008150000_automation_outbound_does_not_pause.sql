-- Zelo automation (welcome, trial follow-ups, outbound) is sent through the
-- Mend gateway, which forwards to ZeloChat on the same WhatsApp number. The
-- fromMe echo then arrives as a human outbound and paused the AI on every new
-- lead. The gateway registers each automated text before forwarding; the echo
-- consumes that mark and skips the takeover. A human typing on the phone has no
-- mark, so it still pauses. A missing or expired mark fails safe (pauses).
create table private.automation_outbound_marks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  text_hash text not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_message_id uuid
);
create index automation_outbound_marks_open_idx
  on private.automation_outbound_marks (workspace_id, text_hash, created_at)
  where consumed_at is null;
revoke all on private.automation_outbound_marks from public, anon, authenticated;

-- One normalization for both sides, so provider whitespace changes do not miss.
create or replace function private.automation_text_hash(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select md5(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;
revoke all on function private.automation_text_hash(text) from public, anon, authenticated;

create or replace function public.register_automation_outbound(p_text text)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  target_workspace uuid;
  mark_id uuid;
begin
  if coalesce(btrim(p_text), '') = '' then
    raise exception 'automation_text_required' using errcode = '22023';
  end if;
  select workspace_id into target_workspace from public.internal_workspace limit 1;
  if target_workspace is null then
    raise exception 'internal_workspace_unconfigured' using errcode = '55000';
  end if;
  delete from private.automation_outbound_marks
  where created_at < now() - interval '1 day';
  insert into private.automation_outbound_marks (workspace_id, text_hash)
  values (target_workspace, private.automation_text_hash(p_text))
  returning id into mark_id;
  return mark_id;
end;
$$;
revoke all on function public.register_automation_outbound(text) from public, anon, authenticated;
grant execute on function public.register_automation_outbound(text) to service_role;

create or replace function private.pause_after_human_message()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  mark_id uuid;
begin
  if new.direction = 'outbound'
     and not new.ai_generated then
    if new.sent_by_user_id is null then
      update private.automation_outbound_marks m
      set consumed_at = now(), consumed_message_id = new.id
      where m.id = (
        select o.id
        from private.automation_outbound_marks o
        where o.workspace_id = new.workspace_id
          and o.text_hash = private.automation_text_hash(new.text)
          and o.consumed_at is null
          and o.created_at > now() - interval '15 minutes'
        order by o.created_at
        limit 1
        for update skip locked
      )
      returning m.id into mark_id;
    end if;
    if mark_id is not null then
      insert into public.audit_log (
        workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
      ) values (
        new.workspace_id, null, 'ai.automation_outbound', 'conversation', new.conversation_id,
        jsonb_build_object('message_id', new.id, 'origin', new.origin, 'mark_id', mark_id)
      );
      return new;
    end if;
    perform private.pause_conversation_for_human(
      new.workspace_id, new.conversation_id, new.id, new.sent_by_user_id, 'human_message'
    );
    insert into public.audit_log (
      workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json
    ) values (
      new.workspace_id, new.sent_by_user_id, 'ai.human_takeover', 'conversation', new.conversation_id,
      jsonb_build_object('message_id', new.id, 'origin', new.origin)
    );
  end if;
  return new;
end;
$$;
