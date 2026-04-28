from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.db import get_session
from grillmi.deps import CurrentUser, current_user, require_csrf
from grillmi.repos import grillade_items_repo, grilladen_repo
from grillmi.routes._serialize import parse_since, serialize, server_time_iso

router = APIRouter(tags=["grilladen"])


class _Body(BaseModel):
    model_config = {"extra": "allow"}


@router.get("")
async def list_grilladen(
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
    since: str | None = Query(default=None),
) -> dict:
    rows = await grilladen_repo.list_for_user(db, current.user.id, parse_since(since))
    return {
        "rows": [serialize(r, grilladen_repo.FIELDS) for r in rows],
        "server_time": server_time_iso(),
    }


@router.post("", status_code=201)
async def create_grillade(
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    body = payload.model_dump()
    try:
        row = await grilladen_repo.create(db, current.user.id, body)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="active_grillade_exists")
    return serialize(row, grilladen_repo.FIELDS)


@router.get("/{grillade_id}")
async def get_grillade(
    grillade_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    row = await grilladen_repo.get_for_user(db, current.user.id, grillade_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    return serialize(row, grilladen_repo.FIELDS)


@router.patch("/{grillade_id}")
async def patch_grillade(
    grillade_id: uuid.UUID,
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    body = payload.model_dump()
    persisted = await grilladen_repo.get_for_user(db, current.user.id, grillade_id)
    if persisted is None:
        raise HTTPException(status_code=404, detail="not_found")
    if _request_is_older(body.get("updated_at"), persisted.updated_at):
        raise HTTPException(status_code=409, detail="stale_update")
    try:
        row = await grilladen_repo.update(db, current.user.id, grillade_id, body)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="active_grillade_exists")
    return serialize(row, grilladen_repo.FIELDS)


@router.delete("/{grillade_id}", status_code=204)
async def delete_grillade(
    grillade_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> None:
    deleted = await grilladen_repo.soft_delete(db, current.user.id, grillade_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="not_found")
    await db.commit()


@router.get("/{grillade_id}/items")
async def list_items(
    grillade_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
    since: str | None = Query(default=None),
) -> dict:
    rows = await grillade_items_repo.list_for_grillade(
        db, current.user.id, grillade_id, parse_since(since)
    )
    if rows is None:
        raise HTTPException(status_code=404, detail="parent_not_found")
    return {
        "rows": [serialize(r, grillade_items_repo.FIELDS) for r in rows],
        "server_time": server_time_iso(),
    }


@router.post("/{grillade_id}/items", status_code=201)
async def create_item(
    grillade_id: uuid.UUID,
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    row = await grillade_items_repo.create(
        db, current.user.id, grillade_id, payload.model_dump()
    )
    if row is None:
        raise HTTPException(status_code=409, detail="parent_missing")
    await db.commit()
    return serialize(row, grillade_items_repo.FIELDS)


@router.patch("/{grillade_id}/items/{item_id}")
async def patch_item(
    grillade_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    body = payload.model_dump()
    persisted = await grillade_items_repo.get(db, current.user.id, grillade_id, item_id)
    if persisted is None:
        raise HTTPException(status_code=404, detail="not_found")
    if _request_is_older(body.get("updated_at"), persisted.updated_at):
        raise HTTPException(status_code=409, detail="stale_update")
    row = await grillade_items_repo.update(db, current.user.id, grillade_id, item_id, body)
    await db.commit()
    return serialize(row, grillade_items_repo.FIELDS)


@router.delete("/{grillade_id}/items/{item_id}", status_code=204)
async def delete_item(
    grillade_id: uuid.UUID,
    item_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> None:
    deleted = await grillade_items_repo.soft_delete(
        db, current.user.id, grillade_id, item_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="not_found")
    await db.commit()


def _request_is_older(request_value: Any, persisted: datetime | None) -> bool:
    if request_value is None or persisted is None:
        return False
    if isinstance(request_value, datetime):
        r = request_value
    else:
        r = datetime.fromisoformat(str(request_value).replace("Z", "+00:00"))
    if r.tzinfo is None:
        r = r.replace(tzinfo=timezone.utc)
    p = persisted if persisted.tzinfo else persisted.replace(tzinfo=timezone.utc)
    return r < p
