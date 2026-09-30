-- 0022 The walker's boarding space on the public profile.
-- Walkers aren't world-readable (0009): the public page reads
-- public_walker_profile() only. 0020 let anyone select walker_space_photos
-- directly, which listed every walker's id. Now: the walker and their own
-- clients read the rows; the public sees the photos (and boarding rates, when
-- the walker takes boarders) through public_walker_profile().

drop policy "anyone sees space photos" on walker_space_photos;
create policy "clients see their walker's space photos" on walker_space_photos for select
  using (exists (select 1 from clients c where c.walker_id = walker_space_photos.walker_id and c.profile_id = auth.uid()));

create or replace function public_walker_profile(p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'handle', w.handle,
    'business_name', w.business_name,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'bio', w.bio,
    'service_area', w.service_area,
    'background_checked', w.background_check_verified_at is not null,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', st.name, 'category', st.category,
               'rate_cents', ws.rate_cents, 'duration_min', coalesce(ws.duration_min, st.default_duration_min))
             order by st.sort_order, st.name)
      from walker_services ws join service_types st on st.id = ws.service_type_id
      where ws.walker_id = w.id and ws.enabled), '[]'::jsonb),
    'rating_count', coalesce(r.rating_count, 0),
    'rating_avg', r.avg_score,
    'boarding', case when w.boarding_capacity > 0 and w.boarding_night_cents is not null
                     then jsonb_build_object('night_cents', w.boarding_night_cents, 'extra_pet_cents', w.boarding_extra_pet_cents)
                end,
    'space_photos', coalesce((
      select jsonb_agg(jsonb_build_object('storage_path', sp.storage_path, 'caption', sp.caption) order by sp.created_at)
      from walker_space_photos sp where sp.walker_id = w.id), '[]'::jsonb)
  )
  from walkers w
  join profiles p on p.id = w.id
  left join walker_rating_summary r on r.walker_id = w.id
  where w.handle = p_handle and w.status = 'active';
$$;
grant execute on function public_walker_profile(text) to anon, authenticated;
