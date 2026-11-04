insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('beatforge-media','beatforge-media',false,524288000,array['audio/mpeg','audio/wav','audio/x-wav','audio/flac','audio/mp4','audio/aac','audio/ogg','audio/webm','audio/midi','application/octet-stream']) on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "BeatForge users upload own assets" on storage.objects;
create policy "BeatForge users upload own assets" on storage.objects for insert to authenticated with check (bucket_id='beatforge-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "BeatForge users read own assets" on storage.objects;
create policy "BeatForge users read own assets" on storage.objects for select to authenticated using (bucket_id='beatforge-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "BeatForge users update own assets" on storage.objects;
create policy "BeatForge users update own assets" on storage.objects for update to authenticated using (bucket_id='beatforge-media' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='beatforge-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "BeatForge users delete own assets" on storage.objects;
create policy "BeatForge users delete own assets" on storage.objects for delete to authenticated using (bucket_id='beatforge-media' and (storage.foldername(name))[1]=auth.uid()::text);
