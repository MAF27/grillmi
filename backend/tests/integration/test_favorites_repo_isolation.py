from __future__ import annotations

from grillmi.repos import favorites_repo


async def test_user_b_cannot_list_user_a_favorites(db_session, two_users) -> None:
    a, b = two_users
    await favorites_repo.create(
        db_session,
        a.id,
        {"label": "Ribeye fav", "cut_id": "ribeye"},
    )
    await db_session.flush()
    assert await favorites_repo.list_for_user(db_session, b.id, since=None) == []
