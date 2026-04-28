from __future__ import annotations

import uuid

from sqlalchemy import select

from grillmi.models import (
    Favorite,
    GrilladeItem,
    Menu,
    MenuItem,
    UserSettingsRow,
)


async def test_import_full_payload(auth_client, db_session) -> None:
    client, user, _ = await auth_client()

    grillade_id = str(uuid.uuid4())
    item_id = str(uuid.uuid4())
    menu_id = str(uuid.uuid4())
    menu_item_id = str(uuid.uuid4())
    fav_id = str(uuid.uuid4())

    payload = {
        "grilladen": [
            {"id": grillade_id, "name": "G", "status": "planned"}
        ],
        "grillade_items": [
            {
                "id": item_id,
                "grillade_id": grillade_id,
                "label": "Ribeye",
                "cut_id": "ribeye",
                "cook_seconds_min": 240,
                "cook_seconds_max": 360,
                "flip_fraction": "0.5",
                "rest_seconds": 120,
            }
        ],
        "menus": [{"id": menu_id, "name": "M"}],
        "menu_items": [
            {
                "id": menu_item_id,
                "menu_id": menu_id,
                "label": "Steak",
                "cut_id": "ribeye",
            }
        ],
        "favorites": [
            {
                "id": fav_id,
                "label": "Fav",
                "cut_id": "ribeye",
                "last_used_at": "2026-04-28T12:00:00+00:00",
            }
        ],
        "settings": {"theme": "dark"},
    }

    resp = await client.post("/api/sync/import", json=payload)
    assert resp.status_code == 200
    counts = resp.json()["imported_counts"]
    assert counts["grilladen"] == 1
    assert counts["grillade_items"] == 1
    assert counts["menus"] == 1
    assert counts["menu_items"] == 1
    assert counts["favorites"] == 1
    assert counts["settings"] == 1

    async def _one(model, predicate):
        return (await db_session.execute(select(model).where(predicate))).scalar_one()

    item = await _one(GrilladeItem, GrilladeItem.id == uuid.UUID(item_id))
    assert item.label == "Ribeye"
    fav = await _one(Favorite, Favorite.id == uuid.UUID(fav_id))
    assert fav.user_id == user.id
    menu = await _one(Menu, Menu.id == uuid.UUID(menu_id))
    assert menu.user_id == user.id
    mi = await _one(MenuItem, MenuItem.id == uuid.UUID(menu_item_id))
    assert mi.label == "Steak"
    s = await _one(UserSettingsRow, UserSettingsRow.user_id == user.id)
    assert s.value == {"theme": "dark"}


async def test_import_skips_items_with_unknown_parent(auth_client, db_session) -> None:
    client, user, _ = await auth_client()

    payload = {
        "grillade_items": [
            {
                "id": str(uuid.uuid4()),
                "grillade_id": str(uuid.uuid4()),
                "label": "Stranded",
                "cut_id": "ribeye",
                "cook_seconds_min": 60,
                "cook_seconds_max": 120,
                "flip_fraction": "0.5",
                "rest_seconds": 30,
            }
        ],
        "menu_items": [
            {
                "id": str(uuid.uuid4()),
                "menu_id": str(uuid.uuid4()),
                "label": "Stranded",
                "cut_id": "ribeye",
            }
        ],
    }
    resp = await client.post("/api/sync/import", json=payload)
    assert resp.status_code == 200
    counts = resp.json()["imported_counts"]
    assert counts["grillade_items"] == 0
    assert counts["menu_items"] == 0


async def test_import_no_op_when_settings_already_exist(auth_client, db_session) -> None:
    client, user, _ = await auth_client()

    # First call seeds settings
    r1 = await client.post(
        "/api/sync/import", json={"settings": {"theme": "dark"}}
    )
    assert r1.json()["imported_counts"]["settings"] == 1

    # Second call: existing settings row, import is a no-op
    r2 = await client.post(
        "/api/sync/import", json={"settings": {"theme": "light"}}
    )
    assert r2.json()["imported_counts"]["settings"] == 0
