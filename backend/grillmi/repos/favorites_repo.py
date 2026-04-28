from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.models import Favorite

FIELDS = [
    "id",
    "user_id",
    "label",
    "cut_id",
    "thickness_cm",
    "doneness",
    "prep_label",
    "position",
    "last_used_at",
    "created_at",
    "updated_at",
    "deleted_at",
]


async def list_for_user(
    session: AsyncSession, user_id: uuid.UUID, since: datetime | None
) -> list[Favorite]:
    q = select(Favorite).where(Favorite.user_id == user_id)
    if since is not None:
        q = q.where(or_(Favorite.updated_at > since, Favorite.deleted_at > since))
    q = q.order_by(Favorite.last_used_at.desc())
    return list((await session.execute(q)).scalars().all())


async def get_for_user(
    session: AsyncSession, user_id: uuid.UUID, fav_id: uuid.UUID
) -> Favorite | None:
    return (
        await session.execute(
            select(Favorite).where(Favorite.id == fav_id, Favorite.user_id == user_id)
        )
    ).scalar_one_or_none()


async def create(session: AsyncSession, user_id: uuid.UUID, payload: dict[str, Any]) -> Favorite:
    row = Favorite(
        id=uuid.UUID(str(payload["id"])) if payload.get("id") else uuid.uuid4(),
        user_id=user_id,
        label=payload["label"],
        cut_id=payload["cut_id"],
        thickness_cm=Decimal(str(payload["thickness_cm"])) if payload.get("thickness_cm") is not None else None,
        doneness=payload.get("doneness"),
        prep_label=payload.get("prep_label"),
        position=float(payload.get("position", 0.0)),
    )
    if payload.get("last_used_at"):
        row.last_used_at = datetime.fromisoformat(str(payload["last_used_at"]).replace("Z", "+00:00"))
    session.add(row)
    await session.flush()
    return row


async def update(
    session: AsyncSession,
    user_id: uuid.UUID,
    fav_id: uuid.UUID,
    payload: dict[str, Any],
) -> Favorite | None:
    row = await get_for_user(session, user_id, fav_id)
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
    if "last_used_at" in payload:
        v = payload["last_used_at"]
        row.last_used_at = (
            datetime.fromisoformat(str(v).replace("Z", "+00:00")) if v else datetime.now(timezone.utc)
        )
    await session.flush()
    return row


async def soft_delete(
    session: AsyncSession, user_id: uuid.UUID, fav_id: uuid.UUID
) -> bool:
    row = await get_for_user(session, user_id, fav_id)
    if row is None:
        return False
    if row.deleted_at is None:
        row.deleted_at = datetime.now(timezone.utc)
        await session.flush()
    return True
