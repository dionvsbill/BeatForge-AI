create table if not exists public.beatforge_projects (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled session', bpm integer not null default 120 check (bpm between 30 and 300),
  musical_key text, time_signature text not null default '4/4', duration_seconds numeric(12,3),
  status text not null default 'draft' check (status in ('draft','processing','ready','archived')),
  settings jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists beatforge_projects_owner_updated_idx on public.beatforge_projects(owner_id,updated_at desc);
create table if not exists public.beatforge_tracks (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.beatforge_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, name text not null, instrument text not null default 'other',
  track_type text not null default 'audio' check (track_type in ('audio','midi','instrument','drums')), position integer not null default 0,
  muted boolean not null default false, solo boolean not null default false, volume numeric(5,3) not null default 1 check(volume between 0 and 2),
  pan numeric(5,3) not null default 0 check(pan between -1 and 1), midi_data jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists beatforge_tracks_project_idx on public.beatforge_tracks(project_id,position);
create index if not exists beatforge_tracks_owner_idx on public.beatforge_tracks(owner_id);
create table if not exists public.beatforge_assets (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.beatforge_projects(id) on delete cascade,
  track_id uuid references public.beatforge_tracks(id) on delete set null, owner_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null check(asset_type in ('source_audio','stem_audio','midi','export','thumbnail','other')),
  storage_path text not null, original_name text, mime_type text, size_bytes bigint check(size_bytes is null or size_bytes>=0),
  duration_seconds numeric(12,3), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists beatforge_assets_project_idx on public.beatforge_assets(project_id,created_at desc);
create index if not exists beatforge_assets_owner_idx on public.beatforge_assets(owner_id);
create index if not exists beatforge_assets_track_idx on public.beatforge_assets(track_id);
create table if not exists public.beatforge_jobs (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.beatforge_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null check(job_type in ('analysis','separation','transcription','reconstruction','render')),
  status text not null default 'queued' check(status in ('queued','running','succeeded','failed','cancelled')),
  progress integer not null default 0 check(progress between 0 and 100), stage text,
  input_asset_id uuid references public.beatforge_assets(id) on delete set null,
  output jsonb not null default '{}'::jsonb, error_message text, worker_id text, attempts integer not null default 0,
  created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz
);
create index if not exists beatforge_jobs_owner_created_idx on public.beatforge_jobs(owner_id,created_at desc);
create index if not exists beatforge_jobs_queue_idx on public.beatforge_jobs(status,created_at) where status in ('queued','running');
create index if not exists beatforge_jobs_project_idx on public.beatforge_jobs(project_id);
create index if not exists beatforge_jobs_input_asset_idx on public.beatforge_jobs(input_asset_id);
alter table public.beatforge_projects enable row level security;
alter table public.beatforge_tracks enable row level security;
alter table public.beatforge_assets enable row level security;
alter table public.beatforge_jobs enable row level security;
create policy "BeatForge owners manage projects" on public.beatforge_projects for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy "BeatForge owners manage tracks" on public.beatforge_tracks for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy "BeatForge owners manage assets" on public.beatforge_assets for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy "BeatForge owners read jobs" on public.beatforge_jobs for select to authenticated using((select auth.uid())=owner_id);
grant select,insert,update,delete on public.beatforge_projects to authenticated;
grant select,insert,update,delete on public.beatforge_tracks to authenticated;
grant select,insert,update,delete on public.beatforge_assets to authenticated;
grant select on public.beatforge_jobs to authenticated;
