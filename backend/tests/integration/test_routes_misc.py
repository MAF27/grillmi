from __future__ import annotations

import uuid

from grillmi.repos import (
    favorites_repo,
    grillade_items_repo,
    grilladen_repo,
    menu_items_repo,
    menus_repo,
)


async def test_grilladen_soft_delete_idempotent(db_session, make_user) -> None:
    user = await make_user()
    g = await grilladen_repo.create(db_session, user.id, {"name": "G", "status": "planned"})
    await db_session.flush()

    assert await grilladen_repo.soft_delete(db_session, user.id, g.id) is True
    # Second call: already-deleted row still returns True (it exists, no-op).
    assert await grilladen_repo.soft_delete(db_session, user.id, g.id) is True
    # Unknown id returns False.
    assert await grilladen_repo.soft_delete(db_session, user.id, uuid.uuid4()) is False


async def test_grillade_items_get_unknown_grillade(db_session, make_user) -> None:
    user = await make_user()
    assert await grillade_items_repo.get(
        db_session, user.id, uuid.uuid4(), uuid.uuid4()
    ) is None
    assert await grillade_items_repo.list_for_grillade(
        db_session, user.id, uuid.uuid4(), since=None
    ) is None


async def test_menu_items_unknown_parent(db_session, make_user) -> None:
    user = await make_user()
    assert await menu_items_repo.list_for_menu(
        db_session, user.id, uuid.uuid4(), since=None
    ) is None


async def test_menus_soft_delete_unknown(db_session, make_user) -> None:
    user = await make_user()
    assert await menus_repo.soft_delete(db_session, user.id, uuid.uuid4()) is False


async def test_favorites_soft_delete_unknown(db_session, make_user) -> None:
    user = await make_user()
    assert await favorites_repo.soft_delete(db_session, user.id, uuid.uuid4()) is False


async def test_favorites_update_with_thickness_and_last_used(
    db_session, make_user
) -> None:
    user = await make_user()
    fav = await favorites_repo.create(
        db_session, user.id, {"label": "F", "cut_id": "ribeye"}
    )
    await db_session.flush()

    updated = await favorites_repo.update(
        db_session,
        user.id,
        fav.id,
        {
            "label": "F2",
            "thickness_cm": "3.0",
            "last_used_at": "2026-04-28T18:00:00+00:00",
        },
    )
    assert updated is not None and updated.label == "F2"
    assert updated.thickness_cm is not None

    cleared = await favorites_repo.update(
        db_session, user.id, fav.id, {"thickness_cm": None, "last_used_at": None}
    )
    assert cleared is not None and cleared.thickness_cm is None


async def test_grillade_items_create_with_overrides(db_session, make_user) -> None:
    user = await make_user()
    g = await grilladen_repo.create(db_session, user.id, {"name": "G", "status": "planned"})
    await db_session.flush()

    item = await grillade_items_repo.create(
        db_session,
        user.id,
        g.id,
        {
            "id": str(uuid.uuid4()),
            "label": "Steak",
            "cut_id": "ribeye",
            "thickness_cm": "2.5",
            "doneness": "medium",
            "prep_label": "salt+pepper",
            "cook_seconds_min": 240,
            "cook_seconds_max": 360,
            "flip_fraction": "0.5",
            "rest_seconds": 120,
            "started_at": "2026-04-28T18:00:00+00:00",
        },
    )
    await db_session.flush()
    assert item is not None and item.doneness == "medium"

    updated = await grillade_items_repo.update(
        db_session,
        user.id,
        g.id,
        item.id,
        {
            "label": "Updated",
            "cook_seconds_min": 300,
            "cook_seconds_max": 420,
            "flip_fraction": "0.6",
            "rest_seconds": 90,
            "thickness_cm": "3.0",
            "started_at": None,
            "plated_at": "2026-04-28T19:00:00+00:00",
        },
    )
    assert updated is not None
    assert updated.label == "Updated"
    assert updated.flip_fraction is not None
