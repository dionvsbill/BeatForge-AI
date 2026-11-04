"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AudioWaveform, WandSparkles, Piano, Layers3, FolderKanban, Drum, Music2, Clock3, ArrowUpRight, Plus, Search, Bell, Settings2, LogOut, LoaderCircle, CheckCircle2, Activity, Headphones, FileAudio, Sparkles, ChevronRight, Menu, X } from "lucide-react";

type Project={id:string;name:string;bpm:number;musical_key:string|null;status:string;updated_at:string};
type Job={id:string;job_type:string;status:string;progress:number;stage:string|null;created_at:string};
const sections=[
 {title:"AI Song Generator",description:"Shape an original song brief with lyrics, genre, mood, vocal direction, instruments and advanced creative controls.",detail:"Start with a natural-language idea, refine the musical identity, and prepare it for a connected generation model.",href:"/generate",icon:WandSparkles,tag:"CREATE"},
 {title:"Music Studio",description:"Work with multitrack sessions, transport controls, track levels, panning, mute, solo and project saves.",detail:"Build and arrange editable sessions, preview MIDI, manage tracks and export your work.",href:"/studio?tab=studio",icon:AudioWaveform,tag:"PRODUCTION"},
 {title:"Audio to MIDI",description:"Upload a recording, inspect analysis, separate sources and turn detected notes into editable MIDI tracks.",detail:"Review tempo and key estimates, inspect generated notes and refine timing, pitch and velocity in the piano roll.",href:"/studio?tab=audio-midi",icon:Piano,tag:"TRANSCRIPTION"},
 {title:"Stem Splitter",description:"Separate a mixed recording into vocal, drum, bass and accompaniment stems when the worker is configured.",detail:"Track processing progress, preview resulting stem assets and bring them into a production session.",href:"/studio?tab=stems",icon:Layers3,tag:"AUDIO"},
 {title:"MIDI & Drum Editor",description:"Edit note placement, pitch, duration and velocity, or build step-based drum patterns.",detail:"Use the piano-roll workflow and drum sequencer to make musical changes before MIDI export.",href:"/studio?tab=studio",icon:Drum,tag:"EDIT"},
 {title:"My Projects",description:"Keep sessions and source assets organised, return to recent work and monitor background processing.",detail:"Your projects, tracks, uploads and jobs are stored under your signed-in account.",href:"/studio?tab=projects",icon:FolderKanban,tag:"LIBRARY"}
];
export default function Dashboard(){
 const router=useRouter();
 const [email,setEmail]=useState("");
 const [projects,setProjects]=useState<Project[]>([]);
 const [jobs,setJobs]=useState<Job[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [mobileOpen,setMobileOpen]=useState(false);
 const [query,setQuery]=useState("");
 const supabase=getSupabaseBrowserClient();
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user){router.replace("/login?next=%2Fdashboard");return;}
   setEmail(user.email??"");
   const [p,j]=await Promise.all([
    supabase.from("beatforge_projects").select("id,name,bpm,musical_key,status,updated_at").eq("owner_id",user.id).order("updated_at",{ascending:false}).limit(6),
    supabase.from("beatforge_jobs").select("id,job_type,status,progress,stage,created_at").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(5)
   ]);
   if(p.error)throw p.error;
   setProjects((p.data??[]) as Project[]);
   if(!j.error)setJobs((j.data??[]) as Job[]);
  }catch(e){setError(e instanceof Error?e.message:"Unable to load your workspace data.");}
  finally{setLoading(false);}
 },[router,supabase]);
 useEffect(()=>{void load();},[load]);
 async function signOut(){await supabase.auth.signOut();router.replace("/login");router.refresh();}
 const activeJobs=jobs.filter(j=>j.status==="queued"||j.status==="running").length;
 const filtered=sections.filter(s=>(s.title+" "+s.description).toLowerCase().includes(query.toLowerCase()));
 return <main className="min-h-screen bg-[#090a10] text-slate-100">
 <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,rgba(124,58,237,.2),transparent_48%)]"/>
 <div className="relative flex min-h-screen">
 <aside className="hidden w-[255px] shrink-0 flex-col border-r border-white/[.07] bg-[#0c0d14]/95 p-5 lg:flex">
 <Link href="/dashboard" className="mb-10 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600"><AudioWaveform size={21}/></span><span><b>BeatForge <i className="not-italic text-violet-300">AI</i></b><small className="block text-[9px] uppercase tracking-[.2em] text-slate-500">Music production</small></span></Link>
 <div className="mb-3 px-3 text-[9px] font-semibold uppercase tracking-[.22em] text-slate-600">Workspace</div>
 <nav className="space-y-1"><Link href="/dashboard" className="flex items-center gap-3 rounded-xl bg-violet-500/15 px-3 py-3 text-sm text-violet-200"><Activity size={17}/> Overview</Link><Link href="/generate" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/5"><WandSparkles size={17}/> AI Song Generator</Link><Link href="/studio" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/5"><AudioWaveform size={17}/> Music Studio</Link></nav>
 <div className="mb-3 mt-9 px-3 text-[9px] font-semibold uppercase tracking-[.22em] text-slate-600">Your library</div>
 <Link href="/studio" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/5"><FolderKanban size={17}/> Projects & sessions</Link>
 <Link href="/studio" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/5"><FileAudio size={17}/> Audio & stems</Link>
 <div className="mt-auto rounded-2xl border border-violet-400/15 bg-violet-500/[.07] p-4"><Sparkles size={17} className="mb-2 text-violet-300"/><b className="text-xs">Your production hub</b><p className="mt-2 text-[10px] leading-5 text-slate-500">Create, analyse, arrange and export from one connected workspace.</p></div>
 </aside>
 <section className="min-w-0 flex-1">
 <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-white/[.07] bg-[#090a10]/90 px-4 backdrop-blur-xl md:px-8">
 <div className="flex items-center gap-3"><button onClick={()=>setMobileOpen(v=>!v)} className="rounded-lg border border-white/10 p-2 text-slate-300 lg:hidden" aria-label="Toggle navigation">{mobileOpen?<X size={17}/>:<Menu size={17}/>}</button><div><div className="text-[9px] uppercase tracking-[.2em] text-slate-500">Your workspace</div><div className="text-sm font-semibold">Dashboard overview</div></div></div>
 <div className="flex items-center gap-2"><span className="hidden max-w-[190px] truncate text-[10px] text-slate-500 sm:block">{email}</span><button onClick={()=>void signOut()} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:border-rose-400/30 hover:text-rose-200"><LogOut size={14}/> <span className="hidden sm:inline">Sign out</span></button></div>
 </header>
 {mobileOpen&&<nav className="absolute z-20 w-full border-b border-white/10 bg-[#10111a] p-3 lg:hidden"><div className="grid grid-cols-2 gap-2"><Link onClick={()=>setMobileOpen(false)} href="/dashboard" className="rounded-xl bg-violet-500/15 p-3 text-xs text-violet-200">Overview</Link><Link onClick={()=>setMobileOpen(false)} href="/generate" className="rounded-xl p-3 text-xs text-slate-300">AI Song Generator</Link><Link onClick={()=>setMobileOpen(false)} href="/studio" className="rounded-xl p-3 text-xs text-slate-300">Music Studio</Link><Link onClick={()=>setMobileOpen(false)} href="/studio" className="rounded-xl p-3 text-xs text-slate-300">Projects</Link></div></nav>}
 <div className="mx-auto max-w-[1450px] p-4 md:p-8">
 <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[.07] px-3 py-1.5 text-[9px] font-semibold tracking-[.18em] text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/> WORKSPACE READY</div><h1 className="text-3xl font-semibold tracking-tight md:text-[38px]">Good to have you back.</h1><p className="mt-2 text-sm text-slate-400">Your music workspace, projects and creative tools in one place.</p></div><Link href="/generate" className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-xs font-semibold shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:bg-violet-500"><Plus size={16}/> Create a new song</Link></div>
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
 {[{label:"Total projects",value:projects.length,icon:FolderKanban,sub:"Your saved sessions"},{label:"Active processes",value:activeJobs,icon:LoaderCircle,sub:"Queued or processing"},{label:"Recent jobs",value:jobs.length,icon:Activity,sub:"Latest audio tasks"},{label:"Workspace status",value:"Ready",icon:CheckCircle2,sub:"Signed-in workspace"}].map((s,i)=><div key={s.label} className="rounded-2xl border border-white/[.08] bg-[#11121b]/90 p-5"><div className="flex items-center justify-between"><span className="text-[11px] text-slate-500">{s.label}</span><s.icon size={17} className="text-violet-300"/></div><div className="mt-4 text-2xl font-semibold">{loading?<span className="text-slate-600">—</span>:s.value}</div><div className="mt-1 text-[10px] text-slate-600">{s.sub}</div></div>)}
 </div>
 <div className="mt-7 grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
 <section className="rounded-2xl border border-white/[.08] bg-[#11121b]/90 p-5 md:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold">Creative tools</h2><p className="mt-1 text-[10px] text-slate-500">Each workspace is designed for a different stage of music production.</p></div><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#090a10] px-3 py-2"><Search size={14} className="text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a tool..." className="w-36 bg-transparent text-[10px] outline-none placeholder:text-slate-600"/></label></div>
 <div className="mt-5 grid gap-3 md:grid-cols-2">{filtered.map((s)=><Link key={s.title} href={s.href} className="group rounded-xl border border-white/[.07] bg-white/[.02] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-violet-400/30 hover:bg-violet-500/[.05]"><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><s.icon size={18}/></span><span className="text-[8px] font-semibold tracking-[.18em] text-slate-600">{s.tag}</span></div><h3 className="mt-4 text-sm font-semibold">{s.title}</h3><p className="mt-2 text-[10px] leading-5 text-slate-400">{s.description}</p><p className="mt-3 text-[9px] leading-4 text-slate-600">{s.detail}</p><div className="mt-4 flex items-center justify-between text-[10px] font-semibold text-violet-300"><span>Open workspace</span><ArrowUpRight size={14} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"/></div></Link>)}</div>
 </section>
 <div className="space-y-5">
 <section className="rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/[.12] to-[#11121b] p-5"><div className="flex items-center gap-2"><WandSparkles size={17} className="text-violet-300"/><h2 className="text-sm font-semibold">Start with an idea</h2></div><p className="mt-2 text-[11px] leading-5 text-slate-400">Describe a sound, choose the musical direction and prepare your song brief. The actual audio-generation provider must be connected before a generated recording can be produced.</p><Link href="/generate" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-[10px] font-semibold hover:bg-violet-500">Open song generator <ChevronRight size={13}/></Link></section>
 <section className="rounded-2xl border border-white/[.08] bg-[#11121b]/90 p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Recent activity</h2><p className="mt-1 text-[10px] text-slate-500">Your latest processing jobs</p></div><Activity size={16} className="text-violet-300"/></div>{loading?<p className="py-5 text-center text-xs text-slate-600">Loading activity…</p>:jobs.length===0?<div className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center"><Clock3 size={20} className="mx-auto mb-2 text-slate-600"/><p className="text-xs text-slate-400">No processing activity yet</p><p className="mt-1 text-[10px] text-slate-600">Audio analysis and stem jobs will appear here.</p></div>:<div className="space-y-3">{jobs.map(j=><div key={j.id} className="rounded-xl bg-white/[.025] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] capitalize text-slate-300">{j.job_type.replace("_"," ")}</span><span className="text-[9px] capitalize text-slate-500">{j.status}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-500" style={{width:j.progress+"%"}}/></div><p className="mt-1 text-[9px] text-slate-600">{j.stage??"Waiting for worker"} · {j.progress}%</p></div>)}</div>}</section>
 </div></div>
 <section className="mt-5 rounded-2xl border border-white/[.08] bg-[#11121b]/90 p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Recent projects</h2><p className="mt-1 text-[10px] text-slate-500">Pick up where you left off.</p></div><Link href="/studio" className="text-[10px] font-semibold text-violet-300">Open studio <ArrowUpRight size={12} className="ml-1 inline"/></Link></div>{error&&<p className="mb-3 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-[10px] text-rose-200">{error}</p>}{loading?<p className="py-6 text-center text-xs text-slate-600">Loading your projects…</p>:projects.length===0?<div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-white/10 text-center"><div><Music2 size={22} className="mx-auto mb-2 text-slate-600"/><p className="text-xs text-slate-400">Your project library is ready</p><p className="mt-1 text-[10px] text-slate-600">Create or upload a session to see it here.</p><Link href="/studio" className="mt-3 inline-flex items-center gap-2 text-[10px] font-semibold text-violet-300">Create a session <Plus size={12}/></Link></div></div>:<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{projects.map(p=><Link href="/studio" key={p.id} className="rounded-xl border border-white/[.07] bg-white/[.02] p-4 transition hover:border-violet-400/30"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-500/10 text-violet-300"><Music2 size={16}/></span><span className="text-[9px] capitalize text-slate-500">{p.status}</span></div><h3 className="mt-3 truncate text-xs font-semibold">{p.name}</h3><p className="mt-1 text-[10px] text-slate-500">{p.bpm} BPM · {p.musical_key??"Key not set"}</p><p className="mt-3 text-[9px] text-slate-600">Updated {new Date(p.updated_at).toLocaleDateString()}</p></Link>)}</div>}</section>
 <footer className="mt-8 border-t border-white/[.07] py-5 text-[9px] tracking-[.16em] text-slate-600">BEATFORGE AI · YOUR MUSIC WORKSPACE</footer>
 </div></section></div></main>;
}
