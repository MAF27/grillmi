from __future__ import annotations


from grillmi.repos import grilladen_repo


async def test_user_b_cannot_read_user_a_grilladen(db_session, two_users) -> None:
    a, b = two_users
    await grilladen_repo.create(db_session, a.id, {"name": "Saturday cookout", "status": "planned"})
    await db_session.flush()

    rows_for_b = await grilladen_repo.list_for_user(db_session, b.id, since=None)
    assert rows_for_b == []


async def test_user_b_cannot_patch_user_a_grillade(db_session, two_users) -> None:
    a, b = two_users
    grillade = await grilladen_repo.create(
        db_session, a.id, {"name": "private", "status": "planned"}
    )
    await db_session.flush()

    result = await grilladen_repo.update(
        db_session, b.id, grillade.id, {"name": "hijacked"}
    )
    assert result is None

    persisted = await grilladen_repo.get_for_user(db_session, a.id, grillade.id)
    assert persisted is not None
    assert persisted.name == "private"
