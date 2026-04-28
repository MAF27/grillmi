from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.models import Menu

FIELDS = ["id", "user_id", "name", "position", "created_at", "updated_at", "deleted_at"]


async def list_for_user(
    session: AsyncSession, user_id: uuid.UUID, since: datetime | None
) -> list[Menu]:
    q = select(Menu).where(Menu.user_id == user_id)
    if since is not None:
        q = q.where(or_(Menu.updated_at > since, Menu.deleted_at > since))
    q = q.order_by(Menu.position, Menu.created_at)
    return list((await session.execute(q)).scalars().all())


async def get_for_user(
    session: AsyncSession, user_id: uuid.UUID, menu_id: uuid.UUID
) -> Menu | None:
    return (
        await session.execute(
            select(Menu).where(Menu.id == menu_id, Menu.user_id == user_id)
        )
    ).scalar_one_or_none()


async def create(session: AsyncSession, user_id: uuid.UUID, payload: dict[str, Any]) -> Menu:
    row = Menu(
        id=uuid.UUID(str(payload["id"])) if payload.get("id") else uuid.uuid4(),
        user_id=user_id,
        name=payload["name"],
        position=float(payload.get("position", 0.0)),
    )
    session.add(row)
    await session.flush()
    return row


async def update(
    session: AsyncSession,
    user_id: uuid.UUID,
    menu_id: uuid.UUID,
    payload: dict[str, Any],
) -> Menu | None:
    row = await get_for_user(session, user_id, menu_id)
    if row is None:
        return None
    for k in ("name", "position"):
        if k in payload:
            setattr(row, k, payload[k])
    await session.flush()
    return row


async def soft_delete(
    session: AsyncSession, user_id: uuid.UUID, menu_id: uuid.UUID
) -> bool:
    row = await get_for_user(session, user_id, menu_id)
    if row is None:
        return False
    if row.deleted_at is None:
        row.deleted_at = datetime.now(timezone.utc)
        await session.flush()
    return True
