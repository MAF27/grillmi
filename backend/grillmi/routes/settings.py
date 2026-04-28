from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.db import get_session
from grillmi.deps import CurrentUser, current_user, require_csrf
from grillmi.repos import settings_repo
from grillmi.routes._lww import request_is_older
from grillmi.routes._serialize import serialize

router = APIRouter(tags=["settings"])


class _PutBody(BaseModel):
    value: dict[str, Any]
    updated_at: str | None = None


@router.get("")
async def get_settings(
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    row = await settings_repo.get_for_user(db, current.user.id)
    if row is None:
        return {"value": {}, "updated_at": None}
    return {"value": row.value, "updated_at": serialize(row, ["updated_at"])["updated_at"]}


@router.put("")
async def put_settings(
    payload: _PutBody,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> dict:
    persisted = await settings_repo.get_for_user(db, current.user.id)
    if persisted is not None and request_is_older(payload.updated_at, persisted.updated_at):
        raise HTTPException(status_code=409, detail="stale_update")
    row = await settings_repo.upsert(db, current.user.id, payload.value)
    await db.commit()
    return {"value": row.value, "updated_at": serialize(row, ["updated_at"])["updated_at"]}
