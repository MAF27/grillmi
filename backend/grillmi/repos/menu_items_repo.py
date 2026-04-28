from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.models import Menu, MenuItem

FIELDS = [
    "id",
    "menu_id",
    "label",
    "cut_id",
    "thickness_cm",
    "doneness",
    "prep_label",
    "position",
    "created_at",
    "updated_at",
    "deleted_at",
]


async def parent_exists(
    session: AsyncSession, user_id: uuid.UUID, menu_id: uuid.UUID
) -> bool:
    return (
        await session.execute(
            select(Menu.id).where(Menu.id == menu_id, Menu.user_id == user_id)
        )
    ).scalar_one_or_none() is not None


async def list_for_menu(
    session: AsyncSession,
    user_id: uuid.UUID,
    menu_id: uuid.UUID,
    since: datetime | None,
) -> list[MenuItem] | None:
    if not await parent_exists(session, user_id, menu_id):
        return None
    q = select(MenuItem).where(MenuItem.menu_id == menu_id)
    if since is not None:
        q = q.where(or_(MenuItem.updated_at > since, MenuItem.deleted_at > since))
    q = q.order_by(MenuItem.position, MenuItem.created_at)
    return list((await session.execute(q)).scalars().all())


async def create(
    session: AsyncSession,
    user_id: uuid.UUID,
    menu_id: uuid.UUID,
    payload: dict[str, Any],
) -> MenuItem | None:
    if not await parent_exists(session, user_id, menu_id):
        return None
    row = MenuItem(
        id=uuid.UUID(str(payload["id"])) if payload.get("id") else uuid.uuid4(),
        menu_id=menu_id,
        label=payload["label"],
        cut_id=payload["cut_id"],
        thickness_cm=Decimal(str(payload["thickness_cm"])) if payload.get("thickness_cm") is not None else None,
        doneness=payload.get("doneness"),
        prep_label=payload.get("prep_label"),
        position=float(payload.get("position", 0.0)),
    )
    session.add(row)
    await session.flush()
    return row


async def get(
    session: AsyncSession,
    user_id: uuid.UUID,
    menu_id: uuid.UUID,
    item_id: uuid.UUID,
) -> MenuItem | None:
    if not await parent_exists(session, user_id, menu_id):
        return None
    return (
        await session.execute(
            select(MenuItem).where(MenuItem.id == item_id, MenuItem.menu_id == menu_id)
        )
    ).scalar_one_or_none()


async def update(
    session: AsyncSession,
    user_id: uuid.UUID,
    menu_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: dict[str, Any],
) -> MenuItem | None:
    row = await get(session, user_id, menu_id, item_id)
    if row is None:
        return None
    for k in ("label", "cut_id", "doneness", "prep_label", "position"):
        if k in payload:
            setattr(row, k, payload[k])
    if "thickness_cm" in payload:
        row.thickness_cm = (
            Decimal(str(payload["thickness_cm"]))
            if payload["thickness_cm"] is not None
            else None
        )
    await session.flush()
    return row


async def soft_delete(
    session: AsyncSession,
    user_id: uuid.UUID,
    menu_id: uuid.UUID,
    item_id: uuid.UUID,
) -> bool:
    row = await get(session, user_id, menu_id, item_id)
    if row is None:
        return False
    if row.deleted_at is None:
        row.deleted_at = datetime.now(timezone.utc)
        await session.flush()
    return True
