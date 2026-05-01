from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.db import get_session
from grillmi.deps import CurrentUser, current_user, require_csrf
from grillmi.repos import menu_items_repo, menus_repo
from grillmi.routes._lww import request_is_older
from grillmi.routes._models import (
    DeltaResponse,
    MenuItemOut,
    MenuOut,
    parse_since,
    server_time_iso,
)

router = APIRouter(tags=["menus"])


class _Body(BaseModel):
    model_config = {"extra": "allow"}


@router.get("", response_model=DeltaResponse[MenuOut])
async def list_menus(
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
    since: str | None = Query(default=None),
) -> dict:
    rows = await menus_repo.list_for_user(db, current.user.id, parse_since(since))
    return {"rows": rows, "server_time": server_time_iso()}


@router.post("", status_code=201, response_model=MenuOut)
async def create_menu(
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
):
    row = await menus_repo.create(db, current.user.id, payload.model_dump())
    await db.commit()
    return row


@router.get("/{menu_id}", response_model=MenuOut)
async def get_menu(
    menu_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
):
    row = await menus_repo.get_for_user(db, current.user.id, menu_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    return row


@router.patch("/{menu_id}", response_model=MenuOut)
async def patch_menu(
    menu_id: uuid.UUID,
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
):
    body = payload.model_dump()
    persisted = await menus_repo.get_for_user(db, current.user.id, menu_id)
    if persisted is None:
        raise HTTPException(status_code=404, detail="not_found")
    if request_is_older(body.get("updated_at"), persisted.updated_at):
        raise HTTPException(status_code=409, detail="stale_update")
    row = await menus_repo.update(db, current.user.id, menu_id, body)
    await db.commit()
    return row


@router.delete("/{menu_id}", status_code=204)
async def delete_menu(
    menu_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> None:
    if not await menus_repo.soft_delete(db, current.user.id, menu_id):
        raise HTTPException(status_code=404, detail="not_found")
    await db.commit()


@router.get("/{menu_id}/items", response_model=DeltaResponse[MenuItemOut])
async def list_menu_items(
    menu_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
    since: str | None = Query(default=None),
) -> dict:
    rows = await menu_items_repo.list_for_menu(db, current.user.id, menu_id, parse_since(since))
    if rows is None:
        raise HTTPException(status_code=404, detail="parent_not_found")
    return {"rows": rows, "server_time": server_time_iso()}


@router.post("/{menu_id}/items", status_code=201, response_model=MenuItemOut)
async def create_menu_item(
    menu_id: uuid.UUID,
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
):
    row = await menu_items_repo.create(db, current.user.id, menu_id, payload.model_dump())
    if row is None:
        raise HTTPException(status_code=409, detail="parent_missing")
    await db.commit()
    return row


@router.patch("/{menu_id}/items/{item_id}", response_model=MenuItemOut)
async def patch_menu_item(
    menu_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: _Body,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
):
    body = payload.model_dump()
    persisted = await menu_items_repo.get(db, current.user.id, menu_id, item_id)
    if persisted is None:
        raise HTTPException(status_code=404, detail="not_found")
    if request_is_older(body.get("updated_at"), persisted.updated_at):
        raise HTTPException(status_code=409, detail="stale_update")
    row = await menu_items_repo.update(db, current.user.id, menu_id, item_id, body)
    await db.commit()
    return row


@router.delete("/{menu_id}/items/{item_id}", status_code=204)
async def delete_menu_item(
    menu_id: uuid.UUID,
    item_id: uuid.UUID,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> None:
    if not await menu_items_repo.soft_delete(db, current.user.id, menu_id, item_id):
        raise HTTPException(status_code=404, detail="not_found")
    await db.commit()
