-- Demo data is created by the authenticated app seed path so it can be tied to a real user.
-- Keep this file safe to run in a fresh local database.
insert into public.workspaces (name, slug, issue_prefix, timezone, default_language)
values ('Techne', 'techne-demo', 'TEC', 'America/Sao_Paulo', 'en-US')
on conflict (slug) do nothing;
