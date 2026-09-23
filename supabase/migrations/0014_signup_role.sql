-- 0014 Signup can't pick the operator role.
-- user_metadata is set by whoever calls auth.signUp with the public key, so it
-- may only choose walker or client. Operator comes from app_metadata, which
-- only the service role can set (auth.admin.createUser / updateUserById).

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r user_role;
begin
  r := case
    when new.raw_app_meta_data ->> 'role' = 'operator' then 'operator'
    when new.raw_user_meta_data ->> 'role' = 'client' then 'client'
    else 'walker'
  end;
  insert into profiles (id, role, full_name, phone)
  values (new.id, r, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'phone');
  return new;
end $$;
