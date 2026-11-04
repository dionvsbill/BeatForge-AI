# BeatForge AI processing worker

This is a separate, long-running CPU-first processing service. It does not require a rented GPU for audio analysis, Demucs stem separation, or Basic Pitch transcription.

## Required environment

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only; never expose it to the browser or commit it
- `BEATFORGE_WORKER_API_KEY` — protects the authenticated wake endpoint
- `BEATFORGE_STORAGE_BUCKET=beatforge-media` (optional; this is the default)

## CPU-first defaults

- `BEATFORGE_DEVICE=cpu` (default; set to `cuda` only on a compatible NVIDIA host)
- `BEATFORGE_CPU_THREADS=2` (increase only when the host has spare CPU and RAM)
- `DEMUCS_MODEL=htdemucs` (default four-stem model; `htdemucs_6s` is a heavier six-source option)

CPU inference can be slow, especially on long recordings. Start with short WAV/MP3 files and allow the worker enough RAM, disk and processing time. The worker reports its selected device and model at `/health`.

## Optional song-generation provider

Full AI song generation is separate from audio-to-MIDI and production tools. Configure these only when an ACE-Step server is available:

- `ACESTEP_API_URL`
- `ACESTEP_API_KEY`
- `ACESTEP_MODEL`

Without these settings, audio analysis, stem separation, transcription and local MIDI editing continue to work; only cloud song generation is unavailable.

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```

The worker polls the durable Supabase queue and processes jobs. Demucs and Basic Pitch download model weights on first use, so reserve several GB of disk. Basic Pitch performs polyphonic note transcription; it does not guarantee exact instrument identity or perfect note recovery from dense, reverberant mixes. Separate stems first for better review and transcription quality.

## Current processing

- Librosa: BPM, estimated key and duration analysis.
- Demucs: vocals, drums, bass and accompaniment/source classes.
- Spotify Basic Pitch: polyphonic audio-to-MIDI.
- Browser studio: multitrack MIDI, piano roll, drum sequencer, local chord/bassline assistant, MIDI/WAV export and project saving.
- ACE-Step: optional remote full-song generation; requires a separately hosted inference service.
