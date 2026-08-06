-- These public RPCs already enforce workspace membership and are called by
-- agent-scoped API routes. Keep the actual writes in the private definer
-- helper, but do validation and row visibility as the invoking user.
alter function public.pause_conversation_ai(uuid, uuid, text)
  security invoker;
alter function public.resume_conversation_ai(uuid, uuid)
  security invoker;

-- Trigger functions should pin their lookup path even when they are not
-- security definer functions.
alter function private.set_message_origin()
  set search_path = pg_catalog, public, private;
