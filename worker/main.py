import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
app=FastAPI(title="BeatForge AI Worker",version="0.1.0")
API_KEY=os.getenv("BEATFORGE_WORKER_API_KEY","")
class Job(BaseModel):
    job_id:str
    project_id:str
    job_type:str
    asset_path:str
@app.get("/health")
def health(): return {"status":"ok","service":"beatforge-worker"}
@app.post("/jobs/submit")
def submit(job:Job,x_worker_key:str|None=Header(default=None)):
    if not API_KEY or x_worker_key!=API_KEY: raise HTTPException(status_code=401,detail="Unauthorized")
    if job.job_type not in {"analysis","separation","transcription","reconstruction","render"}: raise HTTPException(status_code=422,detail="Unsupported job type")
    raise HTTPException(status_code=501,detail="Durable queue is not configured yet")
