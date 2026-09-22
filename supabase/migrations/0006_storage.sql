-- 0006 Storage buckets: photos (walk/dog photos), avatars, documents (background-check proof).
-- Paths are always prefixed with the walker's id so policies can check ownership.

insert into storage.buckets (id, name, public) values
  ('photos', 'photos', false),
  ('avatars', 'avatars', true),
  ('documents', 'documents', false)
on conflict (id) do nothing;

-- photos/{walker_id}/...
create policy "walker uploads own photos" on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "walker reads own photos" on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "walker deletes own photos" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- Clients read photos their walker has attached to their dogs (via the photos table).
create policy "client reads dog photos" on storage.objects for select
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p join public.dogs d on d.id = p.dog_id
    where p.storage_path = name and d.client_id in (select public.my_client_ids())));

-- avatars/{user_id}/...
create policy "anyone reads avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "user manages own avatar" on storage.objects for all
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- documents/{walker_id}/...
create policy "walker manages own documents" on storage.objects for all
  using (bucket_id = 'documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_operator()))
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
