-- 0015 An invoice's "sent" date is the walker's local date, not the server's (UTC).

create or replace function guard_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_operator() then return new; end if;
  if new.walker_id <> old.walker_id or new.client_id <> old.client_id or new.number <> old.number then
    raise exception 'An invoice''s walker, client and number can''t change';
  end if;
  if old.status <> 'draft' and row(new.period_start, new.period_end, new.issued_on, new.due_on, new.sent_at, new.notes)
     is distinct from row(old.period_start, old.period_end, old.issued_on, old.due_on, old.sent_at, old.notes) then
    raise exception 'A sent invoice can''t be edited';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft' and new.status in ('sent', 'void')) or (old.status = 'sent' and new.status = 'void')) then
    raise exception 'That status change isn''t allowed';
  end if;
  if new.status = 'sent' and old.status = 'draft' then
    new.sent_at := now();
    new.issued_on := coalesce(new.issued_on,
      (now() at time zone coalesce((select time_zone from profiles where id = new.walker_id), 'UTC'))::date);
    new.due_on := coalesce(new.due_on, new.issued_on + (select invoice_net_days from walkers where id = new.walker_id));
  end if;
  if new.status = 'void' and old.status <> 'void' then new.voided_at := now(); end if;
  return new;
end $$;
