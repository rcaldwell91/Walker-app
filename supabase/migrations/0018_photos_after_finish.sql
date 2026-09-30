-- 0018 Owners see a walk's photos once the walker finishes the walk.
-- Photos upload the moment they're taken (so nothing is lost on a trail), but
-- the walker picks which pets each one shows in the wrap-up and reviews the
-- gallery before sending. Until Finish, a new photo has no tags yet and would
-- otherwise count as a group photo that every owner on the walk could see.

create or replace function client_can_see_photo(p_photo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos p
    where p.id = p_photo
      and (p.walk_id is null or exists (select 1 from walks w where w.id = p.walk_id and w.status = 'done'))
      and (
        exists (select 1 from dogs d where d.id = p.dog_id and d.client_id in (select my_client_ids()))
        or exists (select 1 from photo_pets pp join dogs d on d.id = pp.dog_id
                   where pp.photo_id = p.id and d.client_id in (select my_client_ids()))
        or (p.dog_id is null and p.walk_id is not null
            and not exists (select 1 from photo_pets pp where pp.photo_id = p.id)
            and exists (select 1 from walk_client_ids(p.walk_id) c where c in (select my_client_ids())))));
$$;

create or replace function walker_can_see_covered_photo(p_photo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not i_am_suspended() and exists (
    select 1 from photos p
    where p.id = p_photo and p.walk_id in (select walks_with_my_dogs())
      and exists (select 1 from walks w where w.id = p.walk_id and w.status = 'done')
      and (
        exists (select 1 from dogs d where d.id = p.dog_id and d.walker_id = auth.uid())
        or exists (select 1 from photo_pets pp join dogs d on d.id = pp.dog_id
                   where pp.photo_id = p.id and d.walker_id = auth.uid())
        or (p.dog_id is null and not exists (select 1 from photo_pets pp where pp.photo_id = p.id))));
$$;
