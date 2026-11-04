import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const workerUrl = process.env.BEATFORGE_WORKER_URL?.replace(/\/$/, "");
  const workerKey = process.env.BEATFORGE_WORKER_API_KEY;
  if (!workerUrl || !workerKey) {
    return NextResponse.json({ available: false, message: "Audio worker is not configured yet." }, { status: 503 });
  }

  try {
    const response = await fetch(workerUrl + "/jobs/wake", {
      method: "POST",
      headers: { "x-worker-key": workerKey },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ available: false, error: detail.slice(0, 500) }, { status: 502 });
    }
    return NextResponse.json({ available: true, ...(await response.json()) });
  } catch {
    return NextResponse.json({ available: false, message: "Worker is starting or temporarily unavailable. The queued job will be picked up when it is online." }, { status: 202 });
  }
}
