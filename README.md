# BeatForge AI

Standalone browser-based music workspace sharing the existing BuilderOS Supabase project `builder` (project ref `gbqviddfwdgyiqueaaev`). BeatForge records use dedicated `beatforge_*` tables and the private `beatforge-media` bucket; BuilderOS tables are not modified.

## Implemented in this repository

- Next.js 14 App Router, TypeScript, Tailwind, Supabase Auth/Postgres/private Storage.
- User projects and editable multitrack MIDI sessions.
- Import MIDI files into separate editable tracks; edit pitch, timing, duration and velocity in the piano roll; export one track or a complete MIDI file.
- Tone.js MIDI playback transport.
- A 16-step drum pattern editor that converts the pattern to editable MIDI notes.
- Track volume/pan controls and an offline stereo PCM WAV renderer for the MIDI/synth tracks.
- Secure source-audio upload and signed playback URLs.
- AI job queue and a separate Python worker.
- Librosa tempo/key/duration analysis, Demucs source separation, and Basic Pitch polyphonic transcription of separated stems or the full mix.
- Generated stem audio can be previewed in the project. AI-created MIDI tracks are loaded back into the piano roll after the job completes.

## Web app setup

Copy `.env.example` to `.env.local` and set the Supabase URL and publishable key. Never expose `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_*` variable.

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## AI worker setup

Deploy the worker separately from the Next.js app. It needs a persistent Python service, sufficient disk for model downloads and preferably GPU acceleration for long recordings.

```bash
cd worker
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Required worker environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `BEATFORGE_WORKER_API_KEY`
- `BEATFORGE_STORAGE_BUCKET=beatforge-media`
- Optional `DEMUCS_MODEL=htdemucs_6s`

Render worker build command: `pip install -r requirements.txt`. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`. Use a persistent instance with adequate memory and disk.

## AI accuracy and audio rendering limitations

No current model guarantees exact recognition of every instrument or every note in an arbitrary mixed recording. Demucs separates a fixed set of estimated source classes; Basic Pitch is a polyphonic note transcriber, not a universal instrument-identification system. Dense mixes, drums, effects, reverb, delay, overlapping notes and unusual timbres still need human review. The worker applies conservative thresholds and merges near-overlapping same-pitch detections, but this cannot reliably remove every echo or recover every missing/ambiguous note.

The current WAV export is an offline built-in synthesizer render of editable MIDI tracks. It is not yet a full sample-library instrument engine and does not mix the uploaded source audio or separated stems into the rendered WAV. Advanced audio editing, commercial-grade instrument libraries, full effect chains, automation, and a production GPU worker deployment remain future work.

## Security and data

The worker uses a restricted service-role credential only on the server. Authenticated users can access their own project records and their own object paths in the private bucket. AI jobs are claimed through a SECURITY DEFINER queue function restricted to `service_role`. Keep credentials in Render environment settings, not in Git.
