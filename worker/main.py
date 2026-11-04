import os, time, tempfile, subprocess, threading, traceback
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException
from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
app=FastAPI(title="BeatForge AI Processing Worker",version="0.2.0")
API_KEY=os.getenv("BEATFORGE_WORKER_API_KEY","")
SUPABASE_URL=os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY=os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET=os.getenv("BEATFORGE_STORAGE_BUCKET","beatforge-media")
client:Client|None=create_client(SUPABASE_URL,SERVICE_KEY) if SUPABASE_URL and SERVICE_KEY else None
stop_event=threading.Event()
def process(job):
    if client is None: raise RuntimeError("Worker Supabase credentials are not configured")
    job_id=job["id"]; project_id=job["project_id"]; owner_id=job["owner_id"]; job_type=job["job_type"]
    asset=client.table("beatforge_assets").select("*").eq("id",job["input_asset_id"]).eq("owner_id",owner_id).single().execute().data
    if not asset: raise RuntimeError("Input audio asset was not found")
    work=Path(tempfile.mkdtemp(prefix="beatforge-")); source=work/"source_audio"
    source.write_bytes(client.storage.from_(BUCKET).download(asset["storage_path"]))
    client.table("beatforge_jobs").update({"status":"running","progress":5,"stage":"Preparing audio","started_at":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}).eq("id",job_id).execute()
    outputs=[]
    if job_type in ("analysis","separation","transcription","reconstruction","render"):
        import librosa
        y,sr=librosa.load(str(source),sr=None,mono=True)
        tempo,_=librosa.beat.beat_track(y=y,sr=sr)
        tempo=float(tempo) if getattr(tempo,"ndim",0)==0 else float(tempo[0])
        harmonic=librosa.effects.harmonic(y)
        chroma=librosa.feature.chroma_stft(y=harmonic,sr=sr).mean(axis=1)
        key_names=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
        key=key_names[int(chroma.argmax())]
        client.table("beatforge_projects").update({"bpm":max(30,min(300,round(tempo))),"musical_key":key,"duration_seconds":len(y)/sr,"updated_at":"now()"}).eq("id",project_id).execute()
        outputs.append({"kind":"analysis","bpm":round(tempo,2),"estimated_key":key,"duration_seconds":len(y)/sr,"sample_rate":sr})
    if job_type=="separation":
        client.table("beatforge_jobs").update({"progress":25,"stage":"Separating source classes"}).eq("id",job_id).execute()
        out=work/"stems";out.mkdir()
        model=os.getenv("DEMUCS_MODEL","htdemucs_6s")
        subprocess.run(["python","-m","demucs","-n",model,"-o",str(out),str(source)],check=True,timeout=7200)
        stem_dir=out/model/source.stem
        for stem in sorted(stem_dir.glob("*.wav")):
            path=f"{owner_id}/{project_id}/stems/{stem.name}-{int(time.time())}.wav"
            client.storage.from_(BUCKET).upload(path,stem.read_bytes(),{"content-type":"audio/wav","upsert":"true"})
            client.table("beatforge_assets").insert({"project_id":project_id,"owner_id":owner_id,"asset_type":"stem_audio","storage_path":path,"original_name":stem.name,"mime_type":"audio/wav","size_bytes":stem.stat().st_size}).execute()
            outputs.append({"kind":"stem","name":stem.stem,"storage_path":path})
    if job_type in ("transcription","reconstruction"):
        client.table("beatforge_jobs").update({"progress":55,"stage":"Transcribing notes (polyphonic model)"}).eq("id",job_id).execute()
        from basic_pitch.inference import predict
        from basic_pitch import ICASSP_2022_MODEL_PATH
        model_output=predict(str(source),ICASSP_2022_MODEL_PATH)
        midi_data=model_output[1]
        midi_path=work/"transcription.mid";midi_data.write(str(midi_path))
        midi_storage=f"{owner_id}/{project_id}/midi/transcription-{int(time.time())}.mid"
        client.storage.from_(BUCKET).upload(midi_storage,midi_path.read_bytes(),{"content-type":"audio/midi","upsert":"true"})
        client.table("beatforge_assets").insert({"project_id":project_id,"owner_id":owner_id,"asset_type":"midi","storage_path":midi_storage,"original_name":"Transcription.mid","mime_type":"audio/midi","size_bytes":midi_path.stat().st_size,"metadata":{"model":"Spotify Basic Pitch","note_confidence_review":"Basic Pitch outputs note events; it does not guarantee instrument identity or perfect polyphonic separation."}}).execute()
        outputs.append({"kind":"midi","storage_path":midi_storage,"model":"Basic Pitch"})
    client.table("beatforge_jobs").update({"status":"succeeded","progress":100,"stage":"Complete","output":{"results":outputs},"finished_at":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}).eq("id",job_id).execute()
def worker_loop():
    while not stop_event.is_set():
        try:
            if client:
                claimed=client.rpc("beatforge_claim_next_job").execute().data
                if claimed:
                    try: process(claimed)
                    except Exception as exc:
                        client.table("beatforge_jobs").update({"status":"failed","stage":"Processing failed","error_message":str(exc)[:2000],"finished_at":"now()"}).eq("id",claimed["id"]).execute()
                else: stop_event.wait(3)
            else: stop_event.wait(5)
        except Exception: traceback.print_exc();stop_event.wait(5)
@app.on_event("startup")
def start_worker(): threading.Thread(target=worker_loop,daemon=True).start()
@app.on_event("shutdown")
def stop_worker(): stop_event.set()
@app.get("/health")
def health(): return {"status":"ok","service":"beatforge-worker","supabase_configured":client is not None}
@app.post("/jobs/wake")
def wake(x_worker_key:str|None=Header(default=None)):
    if not API_KEY or x_worker_key!=API_KEY: raise HTTPException(status_code=401,detail="Unauthorized")
    return {"accepted":True,"message":"The worker polls the durable Supabase queue."}
