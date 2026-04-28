from __future__ import annotations

from grillmi.repos import menu_items_repo, menus_repo


async def test_user_b_cannot_patch_user_a_menu_item(db_session, two_users) -> None:
    a, b = two_users
    menu = await menus_repo.create(db_session, a.id, {"name": "A"})
    await db_session.flush()

    item = await menu_items_repo.create(
        db_session, a.id, menu.id, {"label": "Lamm", "cut_id": "lamb-chop"}
    )
    await db_session.flush()

    result = await menu_items_repo.update(
        db_session, b.id, menu.id, item.id, {"label": "hacked"}
    )
    assert result is None

    persisted = await menu_items_repo.get(db_session, a.id, menu.id, item.id)
    assert persisted is not None and persisted.label == "Lamm"
