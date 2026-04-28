from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.models import UserSettingsRow


async def get_for_user(
    session: AsyncSession, user_id: uuid.UUID
) -> UserSettingsRow | None:
    return (
        await session.execute(
            select(UserSettingsRow).where(UserSettingsRow.user_id == user_id)
        )
    ).scalar_one_or_none()


async def upsert(
    session: AsyncSession, user_id: uuid.UUID, value: dict[str, Any]
) -> UserSettingsRow:
    row = await get_for_user(session, user_id)
    if row is None:
        row = UserSettingsRow(user_id=user_id, value=value)
        session.add(row)
    else:
        row.value = value
    await session.flush()
    return row
