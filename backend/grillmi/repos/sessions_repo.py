import secrets
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import NamedTuple

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.config import get_settings
from grillmi.models import Session as SessionRow
from grillmi.security.device_label import parse_device_label


class CreatedSession(NamedTuple):
    token: str
    csrf_token: str
    expires_at: datetime
    row_id: uuid.UUID


_LAST_ACTIVE_DEBOUNCE: dict[str, float] = defaultdict(float)
_DEBOUNCE_LOCK = Lock()
_DEBOUNCE_SECONDS = 60.0


async def create_session(
    session: AsyncSession,
    user_id: uuid.UUID,
    ip: str | None,
    user_agent: str | None,
) -> CreatedSession:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=settings.SESSION_MAX_AGE_HOURS)
    row = SessionRow(
        token=token,
        user_id=user_id,
        csrf_token=csrf,
        created_at=now,
        last_active_at=now,
        expires_at=expires_at,
        ip_address=ip,
        user_agent=user_agent,
    )
    session.add(row)
    await session.flush()
    return CreatedSession(token=token, csrf_token=csrf, expires_at=expires_at, row_id=row.id)


async def get_session_by_token(session: AsyncSession, token: str) -> SessionRow | None:
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(SessionRow).where(SessionRow.token == token, SessionRow.expires_at > now)
    )
    row = result.scalar_one_or_none()
    if row is not None:
        await _maybe_touch_last_active(session, row, now)
    return row


async def _maybe_touch_last_active(
    session: AsyncSession, row: SessionRow, now: datetime
) -> None:
    with _DEBOUNCE_LOCK:
        last_touch = _LAST_ACTIVE_DEBOUNCE.get(row.token, 0.0)
        elapsed = time.monotonic() - last_touch
        if elapsed < _DEBOUNCE_SECONDS:
            return
        _LAST_ACTIVE_DEBOUNCE[row.token] = time.monotonic()
    await session.execute(
        update(SessionRow).where(SessionRow.id == row.id).values(last_active_at=now)
    )


async def delete_session(session: AsyncSession, token: str) -> None:
    await session.execute(delete(SessionRow).where(SessionRow.token == token))
    with _DEBOUNCE_LOCK:
        _LAST_ACTIVE_DEBOUNCE.pop(token, None)


async def delete_session_by_id(
    session: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID
) -> int:
    result = await session.execute(
        delete(SessionRow).where(
            SessionRow.id == session_id, SessionRow.user_id == user_id
        )
    )
    return result.rowcount or 0


async def delete_sessions_for_user(session: AsyncSession, user_id: uuid.UUID) -> None:
    await session.execute(delete(SessionRow).where(SessionRow.user_id == user_id))


async def cleanup_expired(session: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    result = await session.execute(delete(SessionRow).where(SessionRow.expires_at <= now))
    return result.rowcount or 0


async def list_sessions_for_user(
    session: AsyncSession, user_id: uuid.UUID, current_token: str | None
) -> list[dict]:
    result = await session.execute(
        select(SessionRow)
        .where(SessionRow.user_id == user_id)
        .order_by(SessionRow.last_active_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(row.id),
            "device_label": parse_device_label(row.user_agent),
            "ip_address": str(row.ip_address) if row.ip_address else None,
            "last_active_at": row.last_active_at.isoformat(),
            "is_current": current_token is not None and row.token == current_token,
        }
        for row in rows
    ]
