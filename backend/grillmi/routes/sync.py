from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.db import get_session
from grillmi.deps import CurrentUser, require_csrf
from grillmi.models import (
    Favorite,
    Grillade,
    GrilladeItem,
    Menu,
    MenuItem,
    UserSettingsRow,
)

router = APIRouter(tags=["sync"])


class ImportPayload(BaseModel):
    grilladen: list[dict[str, Any]] = Field(default_factory=list)
    grillade_items: list[dict[str, Any]] = Field(default_factory=list)
    menus: list[dict[str, Any]] = Field(default_factory=list)
    menu_items: list[dict[str, Any]] = Field(default_factory=list)
    favorites: list[dict[str, Any]] = Field(default_factory=list)
    settings: dict[str, Any] | None = None


@router.post("/import")
async def bulk_import(
    payload: ImportPayload,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    user_id = current.user.id
    counts = {
        "grilladen": 0,
        "grillade_items": 0,
        "menus": 0,
        "menu_items": 0,
        "favorites": 0,
        "settings": 0,
    }

    for raw in payload.grilladen:
        gid = _uuid(raw.get("id"))
        if await _exists_for_user(db, Grillade, gid, user_id):
            continue
        db.add(
            Grillade(
                id=gid,
                user_id=user_id,
                name=raw.get("name"),
                status=raw.get("status") or "planned",
                target_finish_at=_dt(raw.get("target_finish_at")),
                started_at=_dt(raw.get("started_at")),
                ended_at=_dt(raw.get("ended_at")),
                position=float(raw.get("position", 0.0)),
            )
        )
        counts["grilladen"] += 1

    await db.flush()

    for raw in payload.grillade_items:
        iid = _uuid(raw.get("id"))
        if await _exists_simple(db, GrilladeItem, iid):
            continue
        parent_id = _uuid(raw.get("grillade_id"))
        if parent_id is None or not await _exists_for_user(db, Grillade, parent_id, user_id):
            continue
        db.add(
            GrilladeItem(
                id=iid,
                grillade_id=parent_id,
                label=raw["label"],
                cut_id=raw["cut_id"],
                thickness_cm=_dec(raw.get("thickness_cm")),
                doneness=raw.get("doneness"),
                prep_label=raw.get("prep_label"),
                cook_seconds_min=int(raw["cook_seconds_min"]),
                cook_seconds_max=int(raw["cook_seconds_max"]),
                flip_fraction=Decimal(str(raw.get("flip_fraction", "0.5"))),
                rest_seconds=int(raw.get("rest_seconds", 0)),
                status=raw.get("status") or "pending",
                started_at=_dt(raw.get("started_at")),
                plated_at=_dt(raw.get("plated_at")),
                position=float(raw.get("position", 0.0)),
            )
        )
        counts["grillade_items"] += 1

    for raw in payload.menus:
        mid = _uuid(raw.get("id"))
        if await _exists_for_user(db, Menu, mid, user_id):
            continue
        db.add(
            Menu(
                id=mid,
                user_id=user_id,
                name=raw["name"],
                position=float(raw.get("position", 0.0)),
            )
        )
        counts["menus"] += 1

    await db.flush()

    for raw in payload.menu_items:
        iid = _uuid(raw.get("id"))
        if await _exists_simple(db, MenuItem, iid):
            continue
        parent_id = _uuid(raw.get("menu_id"))
        if parent_id is None or not await _exists_for_user(db, Menu, parent_id, user_id):
            continue
        db.add(
            MenuItem(
                id=iid,
                menu_id=parent_id,
                label=raw["label"],
                cut_id=raw["cut_id"],
                thickness_cm=_dec(raw.get("thickness_cm")),
                doneness=raw.get("doneness"),
                prep_label=raw.get("prep_label"),
                position=float(raw.get("position", 0.0)),
            )
        )
        counts["menu_items"] += 1

    for raw in payload.favorites:
        fid = _uuid(raw.get("id"))
        if await _exists_for_user(db, Favorite, fid, user_id):
            continue
        fav = Favorite(
            id=fid,
            user_id=user_id,
            label=raw["label"],
            cut_id=raw["cut_id"],
            thickness_cm=_dec(raw.get("thickness_cm")),
            doneness=raw.get("doneness"),
            prep_label=raw.get("prep_label"),
            position=float(raw.get("position", 0.0)),
        )
        if raw.get("last_used_at"):
            fav.last_used_at = _dt(raw["last_used_at"]) or fav.last_used_at
        db.add(fav)
        counts["favorites"] += 1

    if payload.settings is not None:
        row = (
            await db.execute(
                select(UserSettingsRow).where(UserSettingsRow.user_id == user_id)
            )
        ).scalar_one_or_none()
        if row is None:
            db.add(UserSettingsRow(user_id=user_id, value=payload.settings))
            counts["settings"] = 1

    await db.commit()
    return {"imported_counts": counts}


def _uuid(value: Any) -> uuid.UUID | None:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


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


async def _exists_for_user(db: AsyncSession, Model, row_id: uuid.UUID | None, user_id: uuid.UUID) -> bool:
    if row_id is None:
        return False
    q = select(Model.id).where(Model.id == row_id, Model.user_id == user_id)
    return (await db.execute(q)).scalar_one_or_none() is not None


async def _exists_simple(db: AsyncSession, Model, row_id: uuid.UUID | None) -> bool:
    if row_id is None:
        return False
    q = select(Model.id).where(Model.id == row_id)
    return (await db.execute(q)).scalar_one_or_none() is not None
