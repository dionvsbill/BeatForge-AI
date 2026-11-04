# BeatForge AI

Standalone music-production application sharing the existing BuilderOS Supabase project `builder` (project ref `gbqviddfwdgyiqueaaev`). All application records use dedicated `beatforge_*` tables and the private `beatforge-media` storage bucket.

## Web app
- Next.js 14 App Router, TypeScript, Tailwind
- Supabase Auth, Postgres and private Storage
- Projects and MIDI tracks persist to Supabase
- Piano-roll editor supports note insertion, movement, pitch/length/velocity editing and MIDI export
- Source audio upload and signed playback URLs

Run `npm install && npm run dev` after copying `.env.example` to `.env.local` and adding the Supabase publishable key.

## AI worker
The separate Python worker polls the durable Supabase queue using a service-role credential. It currently supports librosa tempo/key analysis, Demucs `htdemucs_6s` source-class separation and Spotify Basic Pitch polyphonic MIDI transcription. Run in `worker/` with `pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port 8000`.

Deploy the web app and worker separately. The worker needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BEATFORGE_STORAGE_BUCKET`, and optionally `DEMUCS_MODEL`. Do not expose the service-role key in browser variables. First model download can take time and several GB of disk; GPU is strongly recommended for larger recordings.

## Important model limits
No current model can guarantee perfect recognition of every instrument in every recording. The stem model estimates a fixed set of source classes (including vocals, drums, bass, guitar, piano and other); Basic Pitch creates polyphonic note events but does not reliably label every note with its original instrument. Dense mixes, effects, reverb, unusual timbres and overlapping parts need human review. The editor preserves MIDI as editable notes rather than pretending uncertain AI guesses are ground truth.

## Render
Web service: build `npm install && npm run build`; start `npm start`; Node 20.10–24.
Worker: separate Python service with working directory `worker`, build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`. Keep worker on a persistent instance with sufficient memory and disk.
