"""Last-write-wins helpers shared by every entity repo."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


def parse_iso(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = value.replace("Z", "+00:00") if isinstance(value, str) else value
    return datetime.fromisoformat(text)


def request_is_older(persisted: datetime | None, request_updated_at: datetime | None) -> bool:
    if persisted is None or request_updated_at is None:
        return False
    p = persisted if persisted.tzinfo else persisted.replace(tzinfo=timezone.utc)
    r = request_updated_at if request_updated_at.tzinfo else request_updated_at.replace(tzinfo=timezone.utc)
    return r < p


async def now_in_db(session: AsyncSession) -> datetime:  # pragma: no cover - convenience
    from sqlalchemy import func, select

    return (await session.execute(select(func.now()))).scalar_one()


def serialize_row(row: Any, fields: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for f in fields:
        v = getattr(row, f)
        if isinstance(v, datetime):
            out[f] = v.isoformat()
        elif hasattr(v, "hex") and not isinstance(v, (bytes, bytearray)):
            out[f] = str(v)
        else:
            out[f] = v
    return out
