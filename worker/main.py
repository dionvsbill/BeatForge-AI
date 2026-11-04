import os
import time
import tempfile
import subprocess
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from supabase import Client, create_client
from dotenv import load_dotenv

load_dotenv()
app = FastAPI(title="BeatForge AI Processing Worker", version="0.3.0")
API_KEY = os.getenv("BEATFORGE_WORKER_API_KEY", "")
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = os.getenv("BEATFORGE_STORAGE_BUCKET", "beatforge-media")
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
    client.storage.from_(BUCKET).upload(
        storage_path, local_path.read_bytes(),
        {"content-type": mime, "upsert": "true"},
    )


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
        client.table("beatforge_projects").update({
            "bpm": bpm, "musical_key": key, "duration_seconds": duration,
            "updated_at": utc_now(),
        }).eq("id", project_id).execute()
    return {"kind": "analysis", "bpm": bpm, "estimated_key": key,
            "duration_seconds": round(duration, 3), "sample_rate": sr}


def separate_audio(source: Path, work: Path, owner_id: str, project_id: str) -> list[tuple[str, Path]]:
    update_for_stage = {"progress": 18, "stage": "Separating source classes with Demucs"}
    # The caller owns the job ID; progress is updated there.
    out = work / "stems"
    out.mkdir(exist_ok=True)
    model = os.getenv("DEMUCS_MODEL", "htdemucs_6s")
    subprocess.run(
        ["python", "-m", "demucs", "-n", model, "-o", str(out), str(source)],
        check=True, timeout=14400,
    )
    stem_dir = out / model / source.stem
    if not stem_dir.exists():
        raise RuntimeError("Demucs completed but its expected stem folder was not found")
    results: list[tuple[str, Path]] = []
    for stem in sorted(stem_dir.glob("*.wav")):
        label = stem.stem.lower()
        storage_path = f"{owner_id}/{project_id}/stems/{int(time.time() * 1000)}-{stem.name}"
        upload_asset(stem, storage_path, "audio/wav")
        client.table("beatforge_assets").insert({
            "project_id": project_id, "owner_id": owner_id, "asset_type": "stem_audio",
            "storage_path": storage_path, "original_name": stem.name,
            "mime_type": "audio/wav", "size_bytes": stem.stat().st_size,
            "metadata": {"model": model, "source": "Demucs"},
        }).execute()
        results.append((label, stem))
    if not results:
        raise RuntimeError("Demucs did not produce any WAV stems")
    return results


def clean_note_events(notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Suppress near-identical same-pitch detections and merge reverberant overlaps."""
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


def transcribe_sources(
    sources: list[tuple[str, Path]], work: Path, owner_id: str, project_id: str, bpm: float
) -> list[dict[str, Any]]:
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    outputs: list[dict[str, Any]] = []
    for index, (label, audio_file) in enumerate(sources):
        model_output, midi_data, _note_events = predict(
            str(audio_file), ICASSP_2022_MODEL_PATH,
            onset_threshold=0.55, frame_threshold=0.35,
            minimum_note_length=90.0, minimum_frequency=27.5,
            maximum_frequency=5000.0,
        )
        midi_path = work / f"transcription-{index}.mid"
        midi_data.write(str(midi_path))
        safe_label = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in label)
        storage_path = f"{owner_id}/{project_id}/midi/{int(time.time() * 1000)}-{safe_label}.mid"
        upload_asset(midi_path, storage_path, "audio/midi")

        notes: list[dict[str, Any]] = []
        for instrument in midi_data.instruments:
            for note in instrument.notes:
                # One quarter note is four editor steps; editor steps are sixteenth notes.
                start = max(0, round(note.start * bpm * 4 / 60))
                end = max(start + 1, round(note.end * bpm * 4 / 60))
                notes.append({
                    "id": f"{note.pitch}-{round(note.start * 1000)}",
                    "pitch": int(note.pitch), "start": start,
                    "duration": max(1, end - start),
                    "velocity": round(float(note.velocity) / 127, 3),
                })
        notes = clean_note_events(notes)
        lower = label.lower()
        instrument_name = next(
            (name for key, name in [
                ("piano", "piano"), ("bass", "bass"), ("guitar", "guitar"),
                ("drum", "drums"), ("vocal", "voice"),
            ] if key in lower),
            "other",
        )
        existing = client.table("beatforge_tracks").select("id").eq(
            "project_id", project_id
        ).eq("owner_id", owner_id).eq("name", f"{label} · MIDI").execute().data
        if existing:
            client.table("beatforge_tracks").update({
                "instrument": instrument_name, "track_type": "midi",
                "midi_data": notes,
                "metadata": {"source": "Spotify Basic Pitch", "source_stem": label,
                             "review_required": True, "note_cleanup": "same-pitch overlap merge"},
                "updated_at": utc_now(),
            }).eq("id", existing[0]["id"]).execute()
        else:
            client.table("beatforge_tracks").insert({
                "project_id": project_id, "owner_id": owner_id,
                "name": f"{label} · MIDI", "instrument": instrument_name,
                "track_type": "midi", "position": 10 + index, "midi_data": notes,
                "metadata": {"source": "Spotify Basic Pitch", "source_stem": label,
                             "review_required": True, "note_cleanup": "same-pitch overlap merge"},
            }).execute()
        client.table("beatforge_assets").insert({
            "project_id": project_id, "owner_id": owner_id, "asset_type": "midi",
            "storage_path": storage_path, "original_name": f"{label}-transcription.mid",
            "mime_type": "audio/midi", "size_bytes": midi_path.stat().st_size,
            "metadata": {"model": "Spotify Basic Pitch", "source_stem": label},
        }).execute()
        outputs.append({"kind": "midi", "source": label, "storage_path": storage_path,
                        "notes": len(notes), "model": "Basic Pitch"})
        update_job_for_progress = min(94, 55 + int(39 * (index + 1) / max(1, len(sources))))
        # The caller updates the current job progress after each source.
    return outputs


def process(job: dict[str, Any]) -> None:
    if client is None:
        raise RuntimeError("Worker Supabase credentials are not configured")
    job_id, project_id, owner_id = job["id"], job["project_id"], job["owner_id"]
    job_type = job["job_type"]
    asset = client.table("beatforge_assets").select("*").eq(
        "id", job["input_asset_id"]
    ).eq("owner_id", owner_id).single().execute().data
    if not asset:
        raise RuntimeError("Input audio asset was not found")
    work = Path(tempfile.mkdtemp(prefix="beatforge-"))
    source_name = Path(asset.get("original_name") or "source.wav").name\n    source_suffix = Path(source_name).suffix or ".wav"\n    source = download_asset(asset["storage_path"], work / ("source_audio" + source_suffix))
    outputs: list[dict[str, Any]] = []
    if job_type == "render":
        raise RuntimeError("Audio rendering is not enabled yet; export MIDI from the studio.")
    update_job(job_id, status="running", progress=5, stage="Preparing audio", started_at=utc_now())
    if job_type in ("analysis", "separation", "transcription", "reconstruction"):
        outputs.append(analyze_audio(source, project_id))
    if job_type in ("separation", "reconstruction"):
        update_job(job_id, progress=20, stage="Separating instruments")
        stems = separate_audio(source, work, owner_id, project_id)
        outputs.extend({"kind": "stem", "name": label, "file": path.name} for label, path in stems)
    if job_type in ("transcription", "reconstruction"):
        update_job(job_id, progress=52, stage="Preparing transcription sources")
        stem_rows = client.table("beatforge_assets").select("*").eq(
            "project_id", project_id
        ).eq("owner_id", owner_id).eq("asset_type", "stem_audio").order(
            "created_at", desc=True
        ).execute().data or []
        sources: list[tuple[str, Path]] = []
        if stem_rows:
            seen: set[str] = set()
            for row in stem_rows:
                label = Path(row.get("original_name") or "stem.wav").stem.lower()
                if label in seen:
                    continue
                seen.add(label)
                local = download_asset(row["storage_path"], work / f"{label}.wav")
                sources.append((label, local))
        else:
            sources = [("Full mix", source)]
        project_row = client.table("beatforge_projects").select("bpm").eq(
            "id", project_id
        ).single().execute().data
        tempo = max(30.0, float(project_row.get("bpm") or 120))
        midi_outputs = transcribe_sources(sources, work, owner_id, project_id, tempo)
        outputs.extend(midi_outputs)
    update_job(job_id, status="succeeded", progress=100, stage="Complete",
               output={"results": outputs}, finished_at=utc_now())


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
    return {"status": "ok", "service": "beatforge-worker",
            "supabase_configured": client is not None,
            "worker_key_configured": bool(API_KEY)}


@app.post("/jobs/wake")
def wake(x_worker_key: str | None = Header(default=None)) -> dict[str, Any]:
    if not API_KEY or x_worker_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"accepted": True, "message": "The worker polls the durable Supabase queue."}
