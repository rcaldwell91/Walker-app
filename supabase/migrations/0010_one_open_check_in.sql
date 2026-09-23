-- 0010 At most one open check-in per client, even if two page loads race.

create unique index check_ins_one_open on check_ins (client_id) where responded_at is null;

create or replace function open_due_check_ins(p_tz text default 'UTC')
returns setof check_ins language plpgsql security definer set search_path = public as $$
declare
  r record;
  last_due date;
  today date;
begin
  begin
    today := (now() at time zone p_tz)::date;
  exception when others then
    today := (now() at time zone 'UTC')::date;
  end;
  for r in
    select c.id as client_id, c.walker_id, c.created_at, w.check_in_cadence_days as cadence
    from clients c join walkers w on w.id = c.walker_id
    where c.status = 'active' and c.profile_id is not null
      and (c.profile_id = auth.uid() or c.walker_id = auth.uid())
  loop
    continue when exists (select 1 from check_ins where client_id = r.client_id and responded_at is null);
    select max(due_at) into last_due from check_ins where client_id = r.client_id;
    if coalesce(last_due, (r.created_at at time zone p_tz)::date) + r.cadence <= today then
      insert into check_ins (walker_id, client_id, due_at, sent_at) values (r.walker_id, r.client_id, today, now())
      on conflict (client_id) where responded_at is null do nothing;
    end if;
  end loop;
  return query
    select * from check_ins
    where responded_at is null
      and (client_id in (select id from clients where profile_id = auth.uid()) or walker_id = auth.uid());
end $$;
