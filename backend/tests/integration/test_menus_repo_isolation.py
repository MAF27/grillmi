from __future__ import annotations

from grillmi.repos import menus_repo


async def test_user_b_cannot_read_user_a_menus(db_session, two_users) -> None:
    a, b = two_users
    await menus_repo.create(db_session, a.id, {"name": "A's menu"})
    await db_session.flush()
    assert await menus_repo.list_for_user(db_session, b.id, since=None) == []
