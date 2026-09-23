-- 0011 Fix client access to photo files. In 0006 the policy compared
-- p.storage_path = name inside a subquery joining dogs, and dogs has its own
-- "name" column, so it compared the path to the dog's name and never matched.
-- Qualify the storage object's column explicitly.

drop policy "client reads dog photos" on storage.objects;
create policy "client reads dog photos" on storage.objects for select
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p join public.dogs d on d.id = p.dog_id
    where p.storage_path = storage.objects.name and d.client_id in (select public.my_client_ids())));

drop policy "client reads group walk photos" on storage.objects;
create policy "client reads group walk photos" on storage.objects for select
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p
    where p.storage_path = storage.objects.name and p.dog_id is null and p.walk_id is not null
      and exists (select 1 from public.walk_client_ids(p.walk_id) c where c in (select public.my_client_ids()))));
