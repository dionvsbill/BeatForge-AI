-- Extend BeatForge's durable queue for full-song generation requests.
alter table public.beatforge_jobs
  drop constraint if exists beatforge_jobs_job_type_check;
alter table public.beatforge_jobs
  add constraint beatforge_jobs_job_type_check
  check (job_type in ('analysis','separation','transcription','reconstruction','render','generation'));
alter table public.beatforge_jobs
  add column if not exists request_data jsonb not null default '{}'::jsonb;
