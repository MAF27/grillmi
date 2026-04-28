from __future__ import annotations

import asyncio
import socket

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.config import get_settings
from grillmi.db import get_session

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(response: Response, db: AsyncSession = Depends(get_session)) -> dict:
    settings = get_settings()
    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    smtp_ok = False
    try:
        await asyncio.to_thread(_smtp_probe, settings.SMTP_HOST, settings.SMTP_PORT)
        smtp_ok = True
    except Exception:
        smtp_ok = False

    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", "db": db_ok, "smtp_reachable": smtp_ok}
    return {"status": "ok", "db": db_ok, "smtp_reachable": smtp_ok}


def _smtp_probe(host: str, port: int) -> None:
    sock = socket.create_connection((host, port), timeout=2)
    sock.close()
