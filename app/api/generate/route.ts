import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to generate music." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "A song description is required." }, { status: 400 });
  }
  const prompt = body.prompt.trim().slice(0, 1200);
  const lyrics = typeof body.lyrics === "string" ? body.lyrics.slice(0, 12000) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) || "Untitled song" : "Untitled song";
  const duration = Math.max(10, Math.min(600, Number(body.duration) || 120));
  const { data: project, error: projectError } = await supabase.from("beatforge_projects")
    .insert({ owner_id: user.id, name: title, bpm: 120, status: "processing", settings: { source: "ACE-Step 1.5" } })
    .select("id,name,bpm,musical_key,time_signature,status").single();
  if (projectError || !project) return NextResponse.json({ error: projectError?.message || "Could not create song project." }, { status: 500 });

  const requestData = {
    prompt: [prompt, typeof body.genre === "string" ? body.genre : "", typeof body.mood === "string" ? body.mood + " mood" : "",
      Array.isArray(body.instruments) ? "Featuring " + body.instruments.filter(x => typeof x === "string").slice(0, 12).join(", ") : "",
      typeof body.excluded === "string" && body.excluded.trim() ? "Avoid: " + body.excluded.slice(0, 300) : ""].filter(Boolean).join(". "),
    lyrics: body.instrumental === true ? "[Instrumental]" : lyrics,
    instrumental: body.instrumental === true,
    duration,
    title,
    genre: typeof body.genre === "string" ? body.genre : "Other",
    vocal_type: typeof body.voice === "string" ? body.voice : "Auto",
    thinking: true,
    audio_format: "mp3",
    inference_steps: 8
  };
  const { data: job, error: jobError } = await supabase.from("beatforge_jobs")
    .insert({ project_id: project.id, owner_id: user.id, job_type: "generation", status: "queued", stage: "Waiting for ACE-Step GPU", request_data: requestData })
    .select("id").single();
  if (jobError || !job) {
    await supabase.from("beatforge_projects").delete().eq("id", project.id);
    return NextResponse.json({ error: jobError?.message || "Could not queue generation." }, { status: 500 });
  }
  return NextResponse.json({ jobId: job.id, projectId: project.id, projectName: project.name });
}
