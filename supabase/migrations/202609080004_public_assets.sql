-- No anon/authenticated storage policy: every public byte goes through a status check.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('publication-assets','publication-assets',false,52428800,array['application/pdf','image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/wav','video/mp4','text/plain','text/markdown'])
on conflict(id) do nothing;
