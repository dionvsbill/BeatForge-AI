-- BeatForge AI durable worker queue. The RPC is restricted to service_role.
create or replace function public.beatforge_claim_next_job()
returns public.beatforge_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare claimed public.beatforge_jobs;
begin
  update public.beatforge_jobs as j
  set status='running', progress=1, stage='Worker claimed job', started_at=now(), attempts=j.attempts+1
  where j.id = (
    select q.id from public.beatforge_jobs q
    where q.status='queued'
    order by q.created_at
    for update skip locked
    limit 1
  )
  returning j.* into claimed;
  return claimed;
end;
$$;
revoke all on function public.beatforge_claim_next_job() from public, anon, authenticated;
grant execute on function public.beatforge_claim_next_job() to service_role;
drop policy if exists "BeatForge owners submit jobs" on public.beatforge_jobs;
create policy "BeatForge owners submit jobs" on public.beatforge_jobs for insert to authenticated with check ((select auth.uid())=owner_id);
grant insert on public.beatforge_jobs to authenticated;
