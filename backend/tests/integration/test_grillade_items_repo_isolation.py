from __future__ import annotations

from grillmi.repos import grillade_items_repo, grilladen_repo


async def test_user_b_cannot_delete_user_a_item(db_session, two_users) -> None:
    a, b = two_users
    grillade = await grilladen_repo.create(
        db_session, a.id, {"name": "A's cookout", "status": "planned"}
    )
    await db_session.flush()

    item = await grillade_items_repo.create(
        db_session,
        a.id,
        grillade.id,
        {
            "label": "Ribeye",
            "cut_id": "ribeye",
            "cook_seconds_min": 240,
            "cook_seconds_max": 360,
            "flip_fraction": "0.5",
            "rest_seconds": 120,
        },
    )
    await db_session.flush()

    deleted = await grillade_items_repo.soft_delete(db_session, b.id, grillade.id, item.id)
    assert deleted is False

    still = await grillade_items_repo.get(db_session, a.id, grillade.id, item.id)
    assert still is not None
    assert still.deleted_at is None
