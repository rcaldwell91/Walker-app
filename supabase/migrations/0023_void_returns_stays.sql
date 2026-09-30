-- 0023 Voiding an invoice sends a stay back to unbilled, like a walk.
-- A stay's lines (its nights, extra pets, and any adjustment) all carry stay_id.
create or replace function void_invoice_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    perform set_config('app.billing_system', 'on', true);
    update invoice_lines set invoice_id = null where invoice_id = new.id and (kind = 'walk' or stay_id is not null);
    perform set_config('app.billing_system', 'off', true);
  end if;
  return new;
end $$;
