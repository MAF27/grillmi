from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.models import Grillade, GrilladeItem

FIELDS = [
    "id",
    "grillade_id",
    "label",
    "cut_id",
    "thickness_cm",
    "doneness",
    "prep_label",
    "cook_seconds_min",
    "cook_seconds_max",
    "flip_fraction",
    "rest_seconds",
    "status",
    "started_at",
    "plated_at",
    "alarm_state",
    "position",
    "created_at",
    "updated_at",
    "deleted_at",
]


async def list_for_grillade(
    session: AsyncSession,
    user_id: uuid.UUID,
    grillade_id: uuid.UUID,
    since: datetime | None,
) -> list[GrilladeItem] | None:
    parent = (
        await session.execute(
            select(Grillade).where(Grillade.id == grillade_id, Grillade.user_id == user_id)
        )
    ).scalar_one_or_none()
    if parent is None:
        return None
    q = select(GrilladeItem).where(GrilladeItem.grillade_id == grillade_id)
    if since is not None:
        q = q.where(or_(GrilladeItem.updated_at > since, GrilladeItem.deleted_at > since))
    q = q.order_by(GrilladeItem.position, GrilladeItem.created_at)
    return list((await session.execute(q)).scalars().all())


async def parent_exists(
    session: AsyncSession, user_id: uuid.UUID, grillade_id: uuid.UUID
) -> bool:
    return (
        await session.execute(
            select(Grillade.id).where(
                Grillade.id == grillade_id, Grillade.user_id == user_id
            )
        )
    ).scalar_one_or_none() is not None


async def create(
    session: AsyncSession,
    user_id: uuid.UUID,
    grillade_id: uuid.UUID,
    payload: dict[str, Any],
) -> GrilladeItem | None:
    if not await parent_exists(session, user_id, grillade_id):
        return None
    item_id = _uuid_or_default(payload.get("id"))
    existing = (
        await session.execute(
            select(GrilladeItem).where(
                GrilladeItem.id == item_id, GrilladeItem.grillade_id == grillade_id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.deleted_at = None
        existing.label = payload["label"]
        existing.cut_id = payload["cut_id"]
        existing.thickness_cm = _dec(payload.get("thickness_cm"))
        existing.doneness = payload.get("doneness")
        existing.prep_label = payload.get("prep_label")
        existing.cook_seconds_min = int(payload["cook_seconds_min"])
        existing.cook_seconds_max = int(payload["cook_seconds_max"])
        existing.flip_fraction = Decimal(str(payload.get("flip_fraction", "0.5")))
        existing.rest_seconds = int(payload.get("rest_seconds", 0))
        existing.status = payload.get("status") or "pending"
        existing.started_at = _dt(payload.get("started_at"))
        existing.plated_at = _dt(payload.get("plated_at"))
        existing.alarm_state = _alarm_state(payload.get("alarm_state"))
        existing.position = float(payload.get("position", 0.0))
        await session.flush()
        await _touch_parent(session, user_id, grillade_id)
        return existing
    row = GrilladeItem(
        id=item_id,
        grillade_id=grillade_id,
        label=payload["label"],
        cut_id=payload["cut_id"],
        thickness_cm=_dec(payload.get("thickness_cm")),
        doneness=payload.get("doneness"),
        prep_label=payload.get("prep_label"),
        cook_seconds_min=int(payload["cook_seconds_min"]),
        cook_seconds_max=int(payload["cook_seconds_max"]),
        flip_fraction=Decimal(str(payload.get("flip_fraction", "0.5"))),
        rest_seconds=int(payload.get("rest_seconds", 0)),
        status=payload.get("status") or "pending",
        started_at=_dt(payload.get("started_at")),
        plated_at=_dt(payload.get("plated_at")),
        alarm_state=_alarm_state(payload.get("alarm_state")),
        position=float(payload.get("position", 0.0)),
    )
    session.add(row)
    await session.flush()
    await _touch_parent(session, user_id, grillade_id)
    return row


async def get(
    session: AsyncSession,
    user_id: uuid.UUID,
    grillade_id: uuid.UUID,
    item_id: uuid.UUID,
) -> GrilladeItem | None:
    if not await parent_exists(session, user_id, grillade_id):
        return None
    return (
        await session.execute(
            select(GrilladeItem).where(
                GrilladeItem.id == item_id, GrilladeItem.grillade_id == grillade_id
            )
        )
    ).scalar_one_or_none()


async def update(
    session: AsyncSession,
    user_id: uuid.UUID,
    grillade_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: dict[str, Any],
) -> GrilladeItem | None:
    row = await get(session, user_id, grillade_id, item_id)
    if row is None:
        return None
    for k in ("label", "cut_id", "doneness", "prep_label", "status", "position"):
        if k in payload:
            setattr(row, k, payload[k])
    if "cook_seconds_min" in payload:
        row.cook_seconds_min = int(payload["cook_seconds_min"])
    if "cook_seconds_max" in payload:
        row.cook_seconds_max = int(payload["cook_seconds_max"])
    if "flip_fraction" in payload:
        row.flip_fraction = Decimal(str(payload["flip_fraction"]))
    if "rest_seconds" in payload:
        row.rest_seconds = int(payload["rest_seconds"])
    if "thickness_cm" in payload:
        row.thickness_cm = _dec(payload["thickness_cm"])
    if "alarm_state" in payload:
        row.alarm_state = _alarm_state(payload["alarm_state"])
    for k in ("started_at", "plated_at"):
        if k in payload:
            setattr(row, k, _dt(payload[k]))
    await session.flush()
    await _touch_parent(session, user_id, grillade_id)
    await session.refresh(row, ["updated_at"])
    return row


async def soft_delete(
    session: AsyncSession,
    user_id: uuid.UUID,
    grillade_id: uuid.UUID,
    item_id: uuid.UUID,
) -> bool:
    row = await get(session, user_id, grillade_id, item_id)
    if row is None:
        return False
    if row.deleted_at is None:
        row.deleted_at = datetime.now(timezone.utc)
        await session.flush()
        await _touch_parent(session, user_id, grillade_id)
    return True


async def _touch_parent(
    session: AsyncSession, user_id: uuid.UUID, grillade_id: uuid.UUID
) -> None:
    parent = (
        await session.execute(
            select(Grillade).where(Grillade.id == grillade_id, Grillade.user_id == user_id)
        )
    ).scalar_one_or_none()
    if parent is not None:
        parent.updated_at = datetime.now(timezone.utc)
        await session.flush()


def _uuid_or_default(value: Any) -> uuid.UUID:
    if value is None:
        return uuid.uuid4()
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def _dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _dec(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


_ALARM_KINDS = ("putOn", "flip", "ready")


def _coerce_alarm_ts(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).isoformat()
    return str(v)


def _alarm_state(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, Any] = {}
    for kind in _ALARM_KINDS:
        if kind in value:
            out[kind] = _coerce_alarm_ts(value[kind])
    fired = value.get("firedAt")
    if isinstance(fired, dict):
        fired_out: dict[str, str | None] = {}
        for kind in _ALARM_KINDS:
            if kind in fired:
                fired_out[kind] = _coerce_alarm_ts(fired[kind])
        out["firedAt"] = fired_out
    return out
