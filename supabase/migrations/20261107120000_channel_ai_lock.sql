-- Per-channel AI lock (Fase 2 do inbox multicanal).
--
-- The application now reads `channel_connections.settings_json.ai` and fails
-- closed when it is missing: no AI, no knowledge, no MCP tools and no Zelo
-- customer lookup. Channels that exist today (the Zelo number) keep their
-- current behaviour explicitly; any channel connected later (Diagium) starts
-- locked until an admin turns its AI on.
update public.channel_connections
set settings_json = coalesce(settings_json, '{}'::jsonb) || jsonb_build_object(
      'ai',
      jsonb_build_object(
        'enabled', true,
        'knowledge', jsonb_build_object('mode', 'workspace'),
        'mcpEnabled', true,
        'zeloCustomerLookup', true
      )
    ),
    updated_at = now()
where not (coalesce(settings_json, '{}'::jsonb) ? 'ai');
