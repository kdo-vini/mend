-- Placeholder: this version was applied to production out of band (creates the
-- backup role used by infra) and exists only in the remote migration history.
-- Kept as a no-op so `supabase db push` sees local and remote in sync.
-- Do not add SQL here; manage that role outside app migrations.
select 1;
