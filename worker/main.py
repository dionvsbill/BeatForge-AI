import os
import time
import json
import tempfile
import subprocess
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin
import requests

from fastapi import FastAPI, Header, HTTPException
from supabase import Client, create_client
from dotenv import load_dotenv

load_dotenv()
app = FastAPI(title="BeatForge AI Processing Worker", version="0.4.0")
API_KEY = os.getenv("BEATFORGE_WORKER_API_KEY", "")
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = os.getenv("BEATFORGE_STORAGE_BUCKET", "beatforge-media")
ACE_STEP_API_URL = os.getenv("ACESTEP_API_URL", "").rstrip("/")
ACE_STEP_API_KEY = os.getenv("ACESTEP_API_KEY", "")
ACE_STEP_MODEL = os.getenv("ACESTEP_MODEL", "acestep-v15-turbo")
client: Client | None = create_client(SUPABASE_URL, SERVICE_KEY) if SUPABASE_URL and SERVICE_KEY else None
stop_event = threading.Event()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def update_job(job_id: str, **values: Any) -> None:
    if client is None:
        raise RuntimeError("Supabase worker credentials are missing")
    client.table("beatforge_jobs").update(values).eq("id", job_id).execute()


def download_asset(storage_path: str, destination: Path) -> Path:
    if client is None:
        raise RuntimeError("Supabase worker credentials are missing")
    destination.write_bytes(client.storage.from_(BUCKET).download(storage_path))
    return destination


def upload_asset(local_path: Path, storage_path: str, mime: str) -> None:
    if client is None:
        raise RuntimeError("Supabase worker credentials are missing")
    client.storage.from_(BUCKET).upload(storage_path, local_path.read_bytes(),
        {"content-type": mime, "upsert": "true"})


def generate_song(job: dict[str, Any], work: Path) -> dict[str, Any]:
    if not ACE_STEP_API_URL:
        raise RuntimeError("ACE-Step is not connected. Configure ACESTEP_API_URL and ACESTEP_API_KEY on the worker.")
    payload = dict(job.get("request_data") or {})
    if not payload.get("prompt"):
        raise RuntimeError("Generation request is missing its music prompt.")
    payload.update({"model": ACE_STEP_MODEL, "thinking": True, "batch_size": 1})
    headers = {"Content-Type": "application/json"}
    if ACE_STEP_API_KEY:
        headers["Authorization"] = "Bearer " + ACE_STEP_API_KEY
    response = requests.post(ACE_STEP_API_URL + "/release_task", json=payload,
                             headers=headers, timeout=90)
    response.raise_for_status()
    submitted = response.json()
    data = submitted.get("data") or {}
    task_id = data.get("task_id") or submitted.get("task_id")
    if not task_id:
        raise RuntimeError("ACE-Step did not return a task ID: " + str(submitted.get("error") or submitted)[:500])
    update_job(job["id"], progress=8, stage="Generating audio with ACE-Step 1.5",
               output={"provider": "ACE-Step 1.5", "provider_task_id": task_id})
    deadline = time.monotonic() + max(1800, int(payload.get("audio_duration", 120)) * 30)
    result_item = None
    while time.monotonic() < deadline:
        time.sleep(8)
        poll = requests.post(ACE_STEP_API_URL + "/query_result",
            json={"task_id_list": [task_id]}, headers=headers, timeout=60)
        poll.raise_for_status()
        poll_data = poll.json().get("data") or []
        if isinstance(poll_data, dict):
            poll_data = [poll_data]
        if not poll_data:
            continue
        result_item = poll_data[0]
        status = int(result_item.get("status", 0))
        if status == 2:
            raise RuntimeError("ACE-Step generation failed: " + str(result_item.get("result") or result_item)[:1000])
        if status == 1:
            break
        update_job(job["id"], progress=min(90, int(10 + (time.monotonic() % 75))),
                   stage="ACE-Step is composing your song")
    else:
        raise TimeoutError("ACE-Step generation timed out. The provider may still be processing the request.")
    raw_result = result_item.get("result", [])
    if isinstance(raw_result, str):
        try:
            raw_result = json.loads(raw_result)
        except json.JSONDecodeError:
            raw_result = []
    if isinstance(raw_result, dict):
        raw_result = [raw_result]
    if not raw_result or not raw_result[0].get("file"):
        raise RuntimeError("ACE-Step reported success but returned no audio file.")
    remote_file = raw_result[0]["file"]
    audio_url = remote_file if remote_file.startswith("http") else urljoin(ACE_STEP_API_URL + "/", remote_file.lstrip("/"))
    audio_response = requests.get(audio_url, headers=headers, timeout=300)
    audio_response.raise_for_status()
    suffix = Path(remote_file.split("?")[0]).suffix.lower()
    suffix = suffix if suffix in (".mp3", ".wav", ".flac", ".opus", ".aac") else ".mp3"
    local_audio = work / ("generated-song" + suffix)
    local_audio.write_bytes(audio_response.content)
    if not local_audio.stat().st_size:
        raise RuntimeError("ACE-Step returned an empty audio file.")
    owner_id, project_id = job["owner_id"], job["project_id"]
    storage_path = f"{owner_id}/{project_id}/generated/{int(time.time() * 1000)}{suffix}"
    mime = {"mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac",
            ".opus": "audio/opus", ".aac": "audio/aac"}.get(suffix, "audio/mpeg")
    upload_asset(local_audio, storage_path, mime)
    metadata = {"provider": "ACE-Step 1.5", "model": ACE_STEP_MODEL,
                "provider_task_id": task_id, "prompt": payload["prompt"],
                "duration_requested": payload.get("audio_duration")}
    asset = client.table("beatforge_assets").insert({
        "project_id": project_id, "owner_id": owner_id, "asset_type": "export",
        "storage_path": storage_path, "original_name": (payload.get("title") or "Generated song") + suffix,
        "mime_type": mime, "size_bytes": local_audio.stat().st_size, "metadata": metadata
    }).select("id").single().execute().data
    client.table("beatforge_projects").update({"status": "ready", "updated_at": utc_now()}).eq("id", project_id).eq("owner_id", owner_id).execute()
    return {"kind": "generated_audio", "asset_id": asset["id"], "storage_path": storage_path,
            "mime_type": mime, "size_bytes": local_audio.stat().st_size,
            "provider": "ACE-Step 1.5", "title": payload.get("title", "Generated song")}


def analyze_audio(source: Path, project_id: str) -> dict[str, Any]:
    import librosa
    import numpy as np
    y, sr = librosa.load(str(source), sr=None, mono=True)
    if y.size == 0:
        raise RuntimeError("The uploaded audio file is empty or unreadable")
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    tempo_value = float(np.asarray(tempo).reshape(-1)[0])
    harmonic = librosa.effects.harmonic(y)
    chroma = librosa.feature.chroma_stft(y=harmonic, sr=sr).mean(axis=1)
    key_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    key = key_names[int(chroma.argmax())]
    bpm = max(30, min(300, round(tempo_value)))
    duration = float(len(y) / sr)
    if client is not None:
        client.table("beatforge_projects").update({"bpm": bpm, "musical_key": key,
            "duration_seconds": duration, "updated_at": utc_now()}).eq("id", project_id).execute()
    return {"kind": "analysis", "bpm": bpm, "estimated_key": key,
            "duration_seconds": round(duration, 3), "sample_rate": sr}


def separate_audio(source: Path, work: Path, owner_id: str, project_id: str, source_asset_id: str) -> list[tuple[str, Path]]:
    out = work / "stems"
    out.mkdir(exist_ok=True)
    model = os.getenv("DEMUCS_MODEL", "htdemucs_6s")
    subprocess.run(["python", "-m", "demucs", "-n", model, "-o", str(out), str(source)],
                   check=True, timeout=14400)
    stem_dir = out / model / source.stem
    if not stem_dir.exists():
        raise RuntimeError("Demucs completed but its expected stem folder was not found")
    results = []
    for stem in sorted(stem_dir.glob("*.wav")):
        label = stem.stem.lower()
        storage_path = f"{owner_id}/{project_id}/stems/{int(time.time() * 1000)}-{stem.name}"
        upload_asset(stem, storage_path, "audio/wav")
        client.table("beatforge_assets").insert({"project_id": project_id, "owner_id": owner_id,
            "asset_type": "stem_audio", "storage_path": storage_path, "original_name": stem.name,
            "mime_type": "audio/wav", "size_bytes": stem.stat().st_size,
            "metadata": {"model": model, "source": "Demucs", "source_asset_id": source_asset_id}}).execute()
        results.append((label, stem))
    if not results:
        raise RuntimeError("Demucs did not produce any WAV stems")
    return results


def clean_note_events(notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(notes, key=lambda n: (n["pitch"], n["start"], -n["velocity"]))
    cleaned: list[dict[str, Any]] = []
    for note in ordered:
        if note["duration"] <= 0 or not 0 <= note["pitch"] <= 127:
            continue
        previous = cleaned[-1] if cleaned and cleaned[-1]["pitch"] == note["pitch"] else None
        if previous and note["start"] <= previous["start"] + previous["duration"] + 1:
            previous_end = previous["start"] + previous["duration"]
            note_end = note["start"] + note["duration"]
            if note["start"] <= previous_end + 1:
                previous["duration"] = max(previous_end, note_end) - previous["start"]
                previous["velocity"] = max(previous["velocity"], note["velocity"])
                continue
        cleaned.append(note)
    return sorted(cleaned, key=lambda n: (n["start"], n["pitch"]))


def transcribe_sources(sources: list[tuple[str, Path]], work: Path, owner_id: str, project_id: str, bpm: float) -> list[dict[str, Any]]:
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH
    outputs = []
    for index, (label, audio_file) in enumerate(sources):
        _model_output, midi_data, _note_events = predict(str(audio_file), ICASSP_2022_MODEL_PATH,
            onset_threshold=0.55, frame_threshold=0.35, minimum_note_length=90.0,
            minimum_frequency=27.5, maximum_frequency=5000.0)
        midi_path = work / f"transcription-{index}.mid"
        midi_data.write(str(midi_path))
        safe_label = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in label)
        storage_path = f"{owner_id}/{project_id}/midi/{int(time.time() * 1000)}-{safe_label}.mid"
        upload_asset(midi_path, storage_path, "audio/midi")
        notes = []
        for instrument in midi_data.instruments:
            for note in instrument.notes:
                start = max(0, round(note.start * bpm * 4 / 60))
                end = max(start + 1, round(note.end * bpm * 4 / 60))
                notes.append({"id": f"{note.pitch}-{round(note.start * 1000)}", "pitch": int(note.pitch),
                    "start": start, "duration": max(1, end - start),
                    "velocity": round(float(note.velocity) / 127, 3)})
        notes = clean_note_events(notes)
        lower = label.lower()
        instrument_name = next((name for key, name in [("piano", "piano"), ("bass", "bass"),
            ("guitar", "guitar"), ("drum", "drums"), ("vocal", "voice")] if key in lower), "other")
        existing = client.table("beatforge_tracks").select("id").eq("project_id", project_id).eq("owner_id", owner_id).eq("name", f"{label} · MIDI").execute().data
        if existing:
            client.table("beatforge_tracks").update({"instrument": instrument_name, "track_type": "midi",
                "midi_data": notes, "metadata": {"source": "Spotify Basic Pitch", "source_stem": label,
                "review_required": True}, "updated_at": utc_now()}).eq("id", existing[0]["id"]).execute()
        else:
            client.table("beatforge_tracks").insert({"project_id": project_id, "owner_id": owner_id,
                "name": f"{label} · MIDI", "instrument": instrument_name, "track_type": "midi",
                "position": 10 + index, "midi_data": notes,
                "metadata": {"source": "Spotify Basic Pitch", "source_stem": label, "review_required": True}}).execute()
        client.table("beatforge_assets").insert({"project_id": project_id, "owner_id": owner_id,
            "asset_type": "midi", "storage_path": storage_path, "original_name": f"{label}-transcription.mid",
            "mime_type": "audio/midi", "size_bytes": midi_path.stat().st_size,
            "metadata": {"model": "Spotify Basic Pitch", "source_stem": label}}).execute()
        outputs.append({"kind": "midi", "source": label, "storage_path": storage_path, "notes": len(notes), "model": "Basic Pitch"})
    return outputs


def process(job: dict[str, Any]) -> None:
    if client is None:
        raise RuntimeError("Worker Supabase credentials are not configured")
    job_id, project_id, owner_id = job["id"], job["project_id"], job["owner_id"]
    job_type = job["job_type"]
    work = Path(tempfile.mkdtemp(prefix="beatforge-"))
    try:
        update_job(job_id, status="running", progress=5, stage="Preparing request", started_at=utc_now())
        if job_type == "generation":
            result = generate_song(job, work)
            update_job(job_id, status="succeeded", progress=100, stage="Song generated",
                       output={"results": [result]}, finished_at=utc_now())
            return
        if not job.get("input_asset_id"):
            raise RuntimeError("This processing job requires an uploaded source audio asset.")
        asset = client.table("beatforge_assets").select("*").eq("id", job["input_asset_id"]).eq("owner_id", owner_id).single().execute().data
        if not asset:
            raise RuntimeError("Input audio asset was not found")
        source_name = Path(asset.get("original_name") or "source.wav").name
        source = download_asset(asset["storage_path"], work / ("source_audio" + (Path(source_name).suffix or ".wav")))
        outputs: list[dict[str, Any]] = []
        if job_type == "render":
            raise RuntimeError("Audio rendering is not enabled yet; export MIDI from the studio.")
        if job_type in ("analysis", "separation", "transcription", "reconstruction"):
            outputs.append(analyze_audio(source, project_id))
        if job_type in ("separation", "reconstruction"):
            update_job(job_id, progress=20, stage="Separating instruments")
            stems = separate_audio(source, work, owner_id, project_id, asset["id"])
            outputs.extend({"kind": "stem", "name": label, "file": path.name} for label, path in stems)
        if job_type in ("transcription", "reconstruction"):
            update_job(job_id, progress=52, stage="Preparing transcription sources")
            stem_rows = client.table("beatforge_assets").select("*").eq("project_id", project_id).eq("owner_id", owner_id).eq("asset_type", "stem_audio").contains("metadata", {"source_asset_id": asset["id"]}).order("created_at", desc=True).execute().data or []
            sources: list[tuple[str, Path]] = []
            if stem_rows:
                seen: set[str] = set()
                for row in stem_rows:
                    label = Path(row.get("original_name") or "stem.wav").stem.lower()
                    if label in seen: continue
                    seen.add(label)
                    sources.append((label, download_asset(row["storage_path"], work / f"{label}.wav")))
            else:
                sources = [("Full mix", source)]
            project_row = client.table("beatforge_projects").select("bpm").eq("id", project_id).single().execute().data
            tempo = max(30.0, float(project_row.get("bpm") or 120))
            outputs.extend(transcribe_sources(sources, work, owner_id, project_id, tempo))
        update_job(job_id, status="succeeded", progress=100, stage="Complete",
                   output={"results": outputs}, finished_at=utc_now())
    finally:
        import shutil
        shutil.rmtree(work, ignore_errors=True)


def worker_loop() -> None:
    while not stop_event.is_set():
        try:
            if client is None:
                stop_event.wait(5)
                continue
            claimed = client.rpc("beatforge_claim_next_job").execute().data
            if isinstance(claimed, list):
                claimed = claimed[0] if claimed else None
            if not claimed:
                stop_event.wait(3)
                continue
            try:
                process(claimed)
            except Exception as exc:
                traceback.print_exc()
                update_job(claimed["id"], status="failed", stage="Processing failed",
                           error_message=str(exc)[:2000], finished_at=utc_now())
        except Exception:
            traceback.print_exc()
            stop_event.wait(5)


@app.on_event("startup")
def start_worker() -> None:
    threading.Thread(target=worker_loop, daemon=True).start()


@app.on_event("shutdown")
def stop_worker() -> None:
    stop_event.set()


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "beatforge-worker", "supabase_configured": client is not None,
            "worker_key_configured": bool(API_KEY), "acestep_configured": bool(ACE_STEP_API_URL)}


@app.post("/jobs/wake")
def wake(x_worker_key: str | None = Header(default=None)) -> dict[str, Any]:
    if not API_KEY or x_worker_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"accepted": True, "message": "The worker polls the durable Supabase queue."}
