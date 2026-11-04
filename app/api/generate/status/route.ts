import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  const { data: job, error: jobError } = await supabase.from("beatforge_jobs")
    .select("id,project_id,status,progress,stage,error_message,output")
    .eq("id", jobId).eq("owner_id", user.id).maybeSingle();
  if (jobError || !job) return NextResponse.json({ error: "Generation job not found." }, { status: 404 });
  let audioUrl: string | null = null;
  const results = Array.isArray(job.output?.results) ? job.output.results : [];
  const generated = results.find((item: Record<string, unknown>) => item.kind === "generated_audio");
  if (job.status === "succeeded" && generated?.storage_path) {
    const { data } = await supabase.storage.from("beatforge-media")
      .createSignedUrl(String(generated.storage_path), 3600);
    audioUrl = data?.signedUrl ?? null;
  }
  return NextResponse.json({ ...job, audioUrl, generated });
}
