import { createBrowserClient } from "@supabase/ssr";
let client: ReturnType<typeof createBrowserClient> | undefined;
export function getSupabaseBrowserClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return client;
}
