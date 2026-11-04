# BeatForge worker

FastAPI boundary for long-running audio tasks. Job submission intentionally returns 501 until durable queueing, authenticated storage download, progress reporting, retries and cleanup are implemented. Heavy models must not run synchronously inside web requests.

Run: `pip install -r requirements.txt && uvicorn main:app --reload --port 8000`.
