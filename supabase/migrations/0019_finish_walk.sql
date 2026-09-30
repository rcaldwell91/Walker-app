-- 0019 Finishing a walk is one transaction.
-- The wrap-up writes to five tables (log taps, ratings, working on, photo tags,
-- the walk itself). Done as separate calls, a failure or a lost signal halfway
-- left a half-saved walk, and a retry duplicated the log. finish_walk() does it
-- all or nothing, and a second tap on Finish does nothing.
--
-- SECURITY INVOKER: it runs as the walker, so every RLS policy and column guard
-- still applies to every row it touches.

-- Ratings: a plain unique constraint (the partial index couldn't be targeted by
-- an upsert). Rows without a walk (boarding updates, later) have a null walk_id,
-- and nulls never collide.
drop index pet_scores_one_per_walk;
alter table pet_scores add constraint pet_scores_one_per_walk unique (walk_id, dog_id, category);

create or replace function finish_walk(
  p_walk uuid,
  p_events jsonb,        -- [{dog_id, kind}], one per tap
  p_scores jsonb,        -- [{dog_id, category, score}]
  p_working jsonb,       -- [{dog_id, text}], own pets only
  p_tags jsonb,          -- [{photo_id, dog_ids: [..]}]
  p_summary text,
  p_distance_m int,
  p_drive_minutes int,
  p_walk_minutes int,
  p_ended_at timestamptz
) returns text language plpgsql security invoker set search_path = public as $$
declare
  st walk_status;
  e jsonb;
begin
  select status into st from walks where id = p_walk and walker_id = auth.uid() for update;
  if st is null then raise exception 'That walk isn''t yours'; end if;
  if st = 'done' then return 'already done'; end if;

  insert into walk_events (walk_id, dog_id, kind, at)
    select p_walk, (x ->> 'dog_id')::uuid, x ->> 'kind', p_ended_at from jsonb_array_elements(p_events) x;

  insert into pet_scores (walker_id, walk_id, dog_id, category, score)
    select auth.uid(), p_walk, (x ->> 'dog_id')::uuid, x ->> 'category', (x ->> 'score')::smallint from jsonb_array_elements(p_scores) x
    on conflict (walk_id, dog_id, category) do update set score = excluded.score;

  for e in select * from jsonb_array_elements(p_working) loop
    update dogs set working_on = e ->> 'text' where id = (e ->> 'dog_id')::uuid;
    update walk_dogs set working_on = nullif(e ->> 'text', '') where walk_id = p_walk and dog_id = (e ->> 'dog_id')::uuid;
  end loop;

  delete from photo_pets where photo_id in (select (x ->> 'photo_id')::uuid from jsonb_array_elements(p_tags) x);
  insert into photo_pets (photo_id, dog_id)
    select (x ->> 'photo_id')::uuid, d::uuid from jsonb_array_elements(p_tags) x, jsonb_array_elements_text(x -> 'dog_ids') d;

  update walk_dogs set dropped_off_at = p_ended_at where walk_id = p_walk and dropped_off_at is null;
  update walks set status = 'done', ended_at = p_ended_at, wrapup_at = p_ended_at, summary = nullif(trim(p_summary), ''),
                   distance_m = p_distance_m, drive_minutes = p_drive_minutes, walk_minutes = p_walk_minutes
    where id = p_walk;
  return 'done';
end $$;
