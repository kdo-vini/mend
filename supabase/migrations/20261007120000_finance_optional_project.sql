-- Project attribution is optional for every finance source, including Supabase.
do $$
declare
  item record;
begin
  for item in
    select con.conrelid::regclass as tbl, con.conname
    from pg_constraint con
    where con.contype = 'c'
      and con.conrelid in ('public.finance_entries'::regclass, 'public.finance_templates'::regclass)
      and pg_get_constraintdef(con.oid) ilike '%supabase%'
  loop
    execute format('alter table %s drop constraint %I', item.tbl, item.conname);
  end loop;
end $$;
