import asyncio
import json
import logging
import re
from uuid import uuid4
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.services import scan_service

logger = logging.getLogger("continuum.scan")

router = APIRouter()


class ScanRequest(BaseModel):
    repo_full_name: str
    ref: str = "main"

    @field_validator("repo_full_name")
    @classmethod
    def validate_repo_full_name(cls, v: str) -> str:
        if not re.match(r"^[\w.\-]+/[\w.\-]+$", v):
            raise ValueError("Invalid repo_full_name format")
        return v

    @field_validator("ref")
    @classmethod
    def validate_ref(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z0-9._/\-]+$", v):
            raise ValueError("Invalid ref format")
        return v


class ScanStartedResponse(BaseModel):
    scan_id: str


@router.post("", response_model=ScanStartedResponse, status_code=202)
def start_scan(body: ScanRequest, background: BackgroundTasks):
    scan_id = uuid4().hex
    scan_service.SCANS[scan_id] = {"status": "queued", "log": []}
    background.add_task(
        scan_service.run_scan, scan_id, body.repo_full_name, body.ref
    )
    return ScanStartedResponse(scan_id=scan_id)


@router.get("/{scan_id}/events")
async def scan_events(scan_id: str):
    if scan_id not in scan_service.SCANS:
        raise HTTPException(status_code=404, detail="Scan not found")

    async def event_stream():
        scan_data = scan_service.SCANS[scan_id]
        last_yielded = 0

        while True:
            current_len = len(scan_data["log"])
            while last_yielded < current_len:
                event = scan_data["log"][last_yielded]
                yield f"data: {json.dumps(event)}\n\n"
                last_yielded += 1

            status = scan_data.get("status")
            if status in ("completed", "failed"):
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
