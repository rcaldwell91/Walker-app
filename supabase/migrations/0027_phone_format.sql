-- 0027 One phone format everywhere: international (E.164), e.g. +16023013258.
-- New numbers are stored this way by the app (src/lib/input.ts cleanPhone).
-- This brings earlier ones in line: 10 digits (US/Canada) → +1…, 11 digits
-- starting with 1 → +…, blank → null. Anything else (too short, letters) is
-- left exactly as typed; the app shows it as is and asks for a full number
-- the next time that form is saved.

create or replace function _e164_us(p text) returns text language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then null
    when p ~ '[A-Za-z]' then p
    when btrim(p) ~ '^\+' then case when length(regexp_replace(p, '\D', '', 'g')) between 8 and 15 then '+' || regexp_replace(p, '\D', '', 'g') else p end
    when length(regexp_replace(p, '\D', '', 'g')) = 10 then '+1' || regexp_replace(p, '\D', '', 'g')
    when length(regexp_replace(p, '\D', '', 'g')) = 11 and regexp_replace(p, '\D', '', 'g') like '1%' then '+' || regexp_replace(p, '\D', '', 'g')
    else p
  end
$$;

update profiles set phone = _e164_us(phone) where phone is distinct from _e164_us(phone);
update clients set phone = _e164_us(phone) where phone is distinct from _e164_us(phone);
update dogs set vet_phone = _e164_us(vet_phone) where vet_phone is distinct from _e164_us(vet_phone);

drop function _e164_us(text);
