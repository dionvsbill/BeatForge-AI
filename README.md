# BeatForge AI

Standalone AI-assisted music production studio. Shares the existing Supabase project named `builder` for Auth/Postgres/Storage while isolating all music records in `beatforge_*` tables.

## Stack
- Next.js 14 App Router, TypeScript, Tailwind
- Supabase Auth, Postgres and Storage
- Python/FastAPI worker boundary for heavy audio jobs
- Web Audio/Tone.js and wavesurfer.js for browser audio

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Add the Supabase publishable key for project `builder`.
3. `npm install && npm run dev`.
4. Worker: `cd worker && pip install -r requirements.txt && uvicorn main:app --reload --port 8000`.

The first release establishes the studio UI, data model and worker boundary. Model-backed separation/transcription, durable queueing, MIDI editing and export still need implementation and verification. Never expose the Supabase service-role key in browser code.
