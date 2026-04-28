from __future__ import annotations

from grillmi.repos import settings_repo


async def test_user_b_settings_are_independent(db_session, two_users) -> None:
    a, b = two_users
    await settings_repo.upsert(db_session, a.id, {"theme": "dark"})
    await db_session.flush()

    a_row = await settings_repo.get_for_user(db_session, a.id)
    b_row = await settings_repo.get_for_user(db_session, b.id)
    assert a_row is not None and a_row.value == {"theme": "dark"}
    assert b_row is None

    await settings_repo.upsert(db_session, b.id, {"theme": "light"})
    await db_session.flush()

    a_row = await settings_repo.get_for_user(db_session, a.id)
    assert a_row is not None and a_row.value == {"theme": "dark"}
