"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioWaveform, LoaderCircle, Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
export default function LoginPage(){
 const router=useRouter();
 const [mode,setMode]=useState<"signin"|"signup">("signin");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [showPassword,setShowPassword]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 function destination(){
  const next=new URLSearchParams(window.location.search).get("next");
  return next&&next.startsWith("/")&&!next.startsWith("//")?next:"/dashboard";
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setMessage("");setError("");
  try{
   const supabase=getSupabaseBrowserClient();
   if(mode==="signin"){
    const {error:authError}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(authError)throw authError;
    router.replace(destination());router.refresh();
   }else{
    const {data,error:authError}=await supabase.auth.signUp({email:email.trim(),password});
    if(authError)throw authError;
    if(data.session){router.replace(destination());router.refresh();}
    else setMessage("Your account has been created. Check your inbox for the confirmation email, verify your address, then return here to sign in.");
   }
  }catch(e){setError(e instanceof Error?e.message:"Authentication failed. Please try again.");}
  finally{setBusy(false);}
 }
 async function resetPassword(){
  if(!email.trim()){setError("Enter your email address first so we know where to send the reset link.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const {error:resetError}=await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+"/login"});
   if(resetError)throw resetError;
   setMessage("If an account exists for that email, a password-reset link has been sent.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to request a password reset.");}
  finally{setBusy(false);}
 }
 return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#090a10] px-4 py-10 text-slate-100">
 <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(124,58,237,.22),transparent_50%)]"/>
 <div className="relative grid w-full max-w-[960px] overflow-hidden rounded-[28px] border border-white/10 bg-[#10111a] shadow-2xl lg:grid-cols-[1fr_.9fr]">
 <div className="hidden flex-col justify-between border-r border-white/[.07] bg-gradient-to-br from-violet-600/20 via-[#11121b] to-[#11121b] p-10 lg:flex"><div><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-600"><AudioWaveform size={22}/></span><div><b className="text-lg">BeatForge <span className="text-violet-300">AI</span></b><small className="block text-[9px] uppercase tracking-[.22em] text-slate-500">Music production workspace</small></div></div><div className="mt-24"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-[9px] tracking-[.18em] text-violet-200"><Sparkles size={12}/> YOUR SOUND, YOUR CONTROL</div><h1 className="max-w-sm text-4xl font-semibold leading-tight">Make space for your next great record.</h1><p className="mt-4 max-w-sm text-sm leading-7 text-slate-400">Create song ideas, transform audio into editable MIDI, shape stems and build arrangements in one connected studio.</p></div></div><div className="flex items-center gap-3 text-[10px] text-slate-600"><span className="h-px w-8 bg-violet-400/40"/> CREATE · EDIT · PRODUCE · EXPORT</div></div>
 <div className="p-6 sm:p-10"><div className="mb-9 flex items-center gap-3 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600"><AudioWaveform size={20}/></span><b>BeatForge <span className="text-violet-300">AI</span></b></div><div className="mb-8"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[.2em] text-violet-300">{mode==="signin"?"WELCOME BACK":"GET STARTED"}</div><h2 className="text-2xl font-semibold">{mode==="signin"?"Sign in to your studio":"Create your account"}</h2><p className="mt-2 text-xs leading-5 text-slate-500">Your projects and music assets stay connected to your account.</p></div>
 <form onSubmit={submit} className="space-y-4"><label className="block text-[11px] text-slate-400">Email address<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-white/10 bg-[#090a10] px-4 py-3.5 text-sm text-white outline-none transition focus:border-violet-400/60"/></label><label className="block text-[11px] text-slate-400">Password<div className="mt-2 flex rounded-xl border border-white/10 bg-[#090a10] focus-within:border-violet-400/60"><input required minLength={8} type={showPassword?"text":"password"} autoComplete={mode==="signin"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3.5 text-sm text-white outline-none"/><button type="button" onClick={()=>setShowPassword(v=>!v)} className="px-4 text-slate-500" aria-label={showPassword?"Hide password":"Show password"}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>{mode==="signin"&&<div className="flex justify-end"><button type="button" onClick={()=>void resetPassword()} disabled={busy} className="text-[10px] text-violet-300 hover:text-violet-200">Forgot password?</button></div>}<button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 text-xs font-semibold transition hover:bg-violet-500 disabled:opacity-60">{busy?<LoaderCircle size={15} className="animate-spin"/>:<>{mode==="signin"?"Sign in":"Create account"}<ArrowRight size={14}/></>}</button></form>
 {error&&<p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[.07] p-3 text-[11px] leading-5 text-rose-200">{error}</p>}{message&&<p role="status" className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/[.08] p-3 text-[11px] leading-5 text-violet-100">{message}</p>}
 <p className="mt-7 text-center text-[11px] text-slate-500">{mode==="signin"?"New to BeatForge?":"Already have an account?"} <button type="button" onClick={()=>{setMode(mode==="signin"?"signup":"signin");setMessage("");setError("");}} className="font-semibold text-violet-300 hover:text-violet-200">{mode==="signin"?"Create an account":"Sign in instead"}</button></p><p className="mt-8 text-center text-[9px] leading-5 text-slate-600">By continuing, you agree to use only audio and lyrics you have the rights to upload or process.</p>
 </div></div></main>;
}
