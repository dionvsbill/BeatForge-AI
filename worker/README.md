# BeatForge AI worker

Long-running processing service. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BEATFORGE_WORKER_API_KEY`, and optional `BEATFORGE_STORAGE_BUCKET`. Never put the service-role key in the Next.js public environment.

Install dependencies from requirements.txt, then run `uvicorn main:app --host 0.0.0.0 --port 8000`. Deploy this as a separate persistent Render worker/web service with enough RAM/disk for audio models. Demucs and Basic Pitch download model weights on first use; allow several GB of disk and use GPU hardware for practical processing speed.

Current processing: librosa tempo/key/duration analysis; Demucs htdemucs_6s source-class separation (drums, bass, vocals, guitar, piano, other where the model detects them); Basic Pitch polyphonic MIDI transcription. These models do not identify every instrument perfectly, and transcription of dense mixes, reverberant sounds, unusual instruments and overlapping sources must be reviewed. Stem separation and MIDI transcription are separate stages; request separation first for a cleaner per-stem workflow.
