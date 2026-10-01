-- 0028 Speed: indexes behind every link between tables, and access rules that
-- work out "who is asking" once per query instead of once per row.
-- Nothing here changes what anyone can see or do.

-- 1. An index for every foreign key that doesn't have one (the database's
--    advisor listed 39). Row-level security and joins look rows up by these.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, array_agg(a.attname order by k.ord) as cols
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
      )
    group by c.conrelid, c.conname
  loop
    execute format('create index if not exists %I on %s (%s)',
      left(r.conname || '_idx', 63), r.tbl,
      (select string_agg(quote_ident(x), ', ') from unnest(r.cols) x));
  end loop;
end $$;

-- 2. Access rules that call auth.uid() directly re-check it for every row.
--    Wrapped as (select auth.uid()) Postgres works it out once per query.
--    Same rule, same answer (the advisor's "auth_rls_initplan", 85 rules).
do $$
declare
  r record;
  q text;
  c text;
  wrapped constant text := '( SELECT auth.uid() AS uid)';
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (replace(coalesce(qual, ''), wrapped, '') like '%auth.uid()%'
           or replace(coalesce(with_check, ''), wrapped, '') like '%auth.uid()%')
  loop
    q := replace(replace(replace(r.qual, wrapped, '@@UID@@'), 'auth.uid()', '(select auth.uid())'), '@@UID@@', wrapped);
    c := replace(replace(replace(r.with_check, wrapped, '@@UID@@'), 'auth.uid()', '(select auth.uid())'), '@@UID@@', wrapped);
    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, q, c);
    elsif r.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, q);
    else
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, c);
    end if;
  end loop;
end $$;
