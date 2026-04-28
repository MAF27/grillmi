from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.models import Grillade

FIELDS = [
    "id",
    "user_id",
    "name",
    "status",
    "target_finish_at",
    "started_at",
    "ended_at",
    "position",
    "created_at",
    "updated_at",
    "deleted_at",
]


async def list_for_user(
    session: AsyncSession, user_id: uuid.UUID, since: datetime | None
) -> list[Grillade]:
    q = select(Grillade).where(Grillade.user_id == user_id)
    if since is not None:
        q = q.where(or_(Grillade.updated_at > since, Grillade.deleted_at > since))
    q = q.order_by(Grillade.position, Grillade.created_at)
    return list((await session.execute(q)).scalars().all())


async def get_for_user(
    session: AsyncSession, user_id: uuid.UUID, grillade_id: uuid.UUID
) -> Grillade | None:
    q = select(Grillade).where(Grillade.id == grillade_id, Grillade.user_id == user_id)
    return (await session.execute(q)).scalar_one_or_none()


async def create(
    session: AsyncSession, user_id: uuid.UUID, payload: dict[str, Any]
) -> Grillade:
    row = Grillade(
        id=_uuid_or_default(payload.get("id")),
        user_id=user_id,
        name=payload.get("name"),
        status=payload.get("status") or "planned",
        target_finish_at=_dt(payload.get("target_finish_at")),
        started_at=_dt(payload.get("started_at")),
        ended_at=_dt(payload.get("ended_at")),
        position=float(payload.get("position", 0.0)),
    )
    session.add(row)
    await session.flush()
    return row


async def update(
    session: AsyncSession,
    user_id: uuid.UUID,
    grillade_id: uuid.UUID,
    payload: dict[str, Any],
) -> Grillade | None:
    row = await get_for_user(session, user_id, grillade_id)
    if row is None:
        return None
    for k in ("name", "status", "position"):
        if k in payload:
            setattr(row, k, payload[k])
    for k in ("target_finish_at", "started_at", "ended_at"):
        if k in payload:
            setattr(row, k, _dt(payload[k]))
    await session.flush()
    return row


async def soft_delete(
    session: AsyncSession, user_id: uuid.UUID, grillade_id: uuid.UUID
) -> bool:
    row = await get_for_user(session, user_id, grillade_id)
    if row is None or row.deleted_at is not None:
        return row is not None
    row.deleted_at = datetime.now(timezone.utc)
    await session.flush()
    return True


def _uuid_or_default(value: Any) -> uuid.UUID:
    if value is None:
        return uuid.uuid4()
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


def _dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
