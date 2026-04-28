from __future__ import annotations

from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.models import User


async def assert_isolated(
    *,
    db: AsyncSession,
    user_a: User,
    user_b: User,
    write_for_a: Callable[[AsyncSession, User], Awaitable[Any]],
    list_for_user: Callable[[AsyncSession, User], Awaitable[list]],
) -> None:
    """Generic helper: run write_for_a, then call list_for_user as B and assert empty."""
    await write_for_a(db, user_a)
    await db.flush()
    rows_for_b = await list_for_user(db, user_b)
    assert rows_for_b == [], f"user B should not see user A's rows, got {rows_for_b!r}"
