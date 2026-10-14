-- Shared WhatsApp contacts (contactMessage) were stored as text messages with
-- no body, so the inbox rendered them as an unloadable bubble. The webhook now
-- writes "📇 Name\n+phone"; rebuild the same body for rows already stored,
-- reading the original payload kept on the ingest job.
with source as (
  select m.id, j.payload -> 'message' -> 'raw' -> 'message' -> 'contactMessage' as contact
  from public.messages m
  join public.webhook_events w on w.message_id = m.id
  join public.jobs j on j.id = w.job_id
  where m.message_type = 'text'
    and coalesce(btrim(m.text), '') = ''
    and not m.is_deleted
    and j.payload -> 'message' -> 'raw' -> 'message' ? 'contactMessage'
), rebuilt as (
  select
    id,
    concat_ws(
      E'\n',
      nullif(btrim(contact ->> 'displayName'), ''),
      (
        select string_agg(btrim(phone[1], E' \r'), E'\n')
        from regexp_matches(
          coalesce(contact ->> 'vcard', ''),
          '(?:^|\n)(?:item[0-9]+\.)?TEL[^\n]*:([^\n:]+)',
          'g'
        ) as phone
      )
    ) as body
  from source
)
update public.messages m
set text = '📇 ' || rebuilt.body,
    updated_at = now()
from rebuilt
where m.id = rebuilt.id
  and rebuilt.body <> '';
