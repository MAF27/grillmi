from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.db import get_session
from grillmi.deps import CurrentUser, current_user, require_csrf
from grillmi.repos import favorites_repo
from grillmi.routes._lww import request_is_older
from grillmi.routes._serialize import parse_since, serialize, server_time_iso

router = APIRouter(tags=["favorites"])


class _Body(BaseModel):
    model_config = {"extra": "allow"}


@router.get("")
async def list_favorites(
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
    since: str | None = Query(default=None),
) -> dict:
    rows = await favorites_repo.list_for_user(db, current.user.id, parse_since(since))
    return {
        "rows": [serialize(r, favorites_repo.FIELDS) for r in rows],
        "server_time": server_time_iso(),
    }


@router.post("", status_code=201)
async def create_favorite(
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    row = await favorites_repo.create(db, current.user.id, payload.model_dump())
    await db.commit()
    return serialize(row, favorites_repo.FIELDS)


@router.get("/{fav_id}")
async def get_favorite(
    fav_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    row = await favorites_repo.get_for_user(db, current.user.id, fav_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    return serialize(row, favorites_repo.FIELDS)


@router.patch("/{fav_id}")
async def patch_favorite(
    fav_id: uuid.UUID,
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    body = payload.model_dump()
    persisted = await favorites_repo.get_for_user(db, current.user.id, fav_id)
    if persisted is None:
        raise HTTPException(status_code=404, detail="not_found")
    if request_is_older(body.get("updated_at"), persisted.updated_at):
        raise HTTPException(status_code=409, detail="stale_update")
    row = await favorites_repo.update(db, current.user.id, fav_id, body)
    await db.commit()
    return serialize(row, favorites_repo.FIELDS)


@router.delete("/{fav_id}", status_code=204)
async def delete_favorite(
    fav_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> None:
    if not await favorites_repo.soft_delete(db, current.user.id, fav_id):
        raise HTTPException(status_code=404, detail="not_found")
    await db.commit()
