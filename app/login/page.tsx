"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioWaveform, LoaderCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
export default function LoginPage() {
  const router=useRouter();
  const [mode,setMode]=useState<"signin"|"signup">("signin");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const supabase=getSupabaseBrowserClient();
      if(mode==="signin") {
        const {error}=await supabase.auth.signInWithPassword({email,password});
        if(error) throw error;
        router.replace("/"); router.refresh();
      } else {
        const {data,error}=await supabase.auth.signUp({email,password});
        if(error) throw error;
        setMessage(data.session ? "Account created. Opening your studio…" : "Account created. Check your email to confirm your address, then sign in.");
        if(data.session){router.replace("/");router.refresh();}
      }
    } catch(error) { setMessage(error instanceof Error ? error.message : "Authentication failed."); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-[#090b12] px-4"><div className="w-full max-w-[420px] rounded-3xl border border-[#252b3b] bg-[#111522] p-7 shadow-2xl"><div className="mb-8 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-600"><AudioWaveform size={22}/></div><div><h1 className="text-lg font-bold">BeatForge <span className="text-violet-300">AI</span></h1><p className="text-[10px] uppercase tracking-[.2em] text-slate-500">Your music workspace</p></div></div><h2 className="text-2xl font-semibold">{mode==="signin"?"Welcome back":"Create your studio account"}</h2><p className="mt-2 text-sm text-slate-400">Use your BeatForge account to save sessions, audio and MIDI projects.</p><form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-xs text-slate-400">Email address<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-[#30364a] bg-[#090b12] px-4 py-3 text-sm text-white outline-none focus:border-violet-400"/></label><label className="block text-xs text-slate-400">Password<input required minLength={8} type="password" autoComplete={mode==="signin"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-[#30364a] bg-[#090b12] px-4 py-3 text-sm text-white outline-none focus:border-violet-400"/></label><button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold hover:bg-violet-500 disabled:opacity-60">{busy&&<LoaderCircle size={16} className="animate-spin"/>}{mode==="signin"?"Sign in":"Create account"}</button></form>{message&&<p role="status" className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/10 p-3 text-xs text-violet-100">{message}</p>}<p className="mt-6 text-center text-xs text-slate-500">{mode==="signin"?"New to BeatForge?":"Already have an account?"} <button onClick={()=>{setMode(mode==="signin"?"signup":"signin");setMessage("")}} className="font-semibold text-violet-300 hover:text-violet-200">{mode==="signin"?"Create account":"Sign in"}</button></p></div></main>;
}
