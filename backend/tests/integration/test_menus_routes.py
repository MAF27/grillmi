from __future__ import annotations

import asyncio
import uuid
from datetime import timedelta


async def test_menus_full_lifecycle(auth_client) -> None:
    client, user, session = await auth_client()

    create = await client.post("/api/menus", json={"name": "Saturday menu"})
    assert create.status_code == 201
    menu = create.json()
    menu_id = menu["id"]

    # Get
    got = await client.get(f"/api/menus/{menu_id}")
    assert got.status_code == 200
    assert got.json()["name"] == "Saturday menu"

    # List
    lst = await client.get("/api/menus")
    assert lst.status_code == 200
    assert any(r["id"] == menu_id for r in lst.json()["rows"])

    # Patch
    patch = await client.patch(f"/api/menus/{menu_id}", json={"name": "Renamed"})
    assert patch.status_code == 200
    assert patch.json()["name"] == "Renamed"

    # Add an item, list items
    item = await client.post(
        f"/api/menus/{menu_id}/items",
        json={"label": "Steak", "cut_id": "ribeye"},
    )
    assert item.status_code == 201
    item_id = item.json()["id"]

    items = await client.get(f"/api/menus/{menu_id}/items")
    assert items.status_code == 200
    assert any(r["id"] == item_id for r in items.json()["rows"])

    # Patch the item
    patch_item = await client.patch(
        f"/api/menus/{menu_id}/items/{item_id}",
        json={"label": "Premium Steak"},
    )
    assert patch_item.status_code == 200
    assert patch_item.json()["label"] == "Premium Steak"

    # Delete the item
    del_item = await client.delete(f"/api/menus/{menu_id}/items/{item_id}")
    assert del_item.status_code == 204

    # Delete the menu
    del_menu = await client.delete(f"/api/menus/{menu_id}")
    assert del_menu.status_code == 204


async def test_get_unknown_menu_returns_404(auth_client) -> None:
    client, _, _ = await auth_client()
    resp = await client.get(f"/api/menus/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_patch_unknown_menu_returns_404(auth_client) -> None:
    client, _, _ = await auth_client()
    resp = await client.patch(f"/api/menus/{uuid.uuid4()}", json={"name": "x"})
    assert resp.status_code == 404


async def test_menu_items_unknown_parent_returns_404_or_409(auth_client) -> None:
    client, _, _ = await auth_client()
    bogus = uuid.uuid4()
    list_resp = await client.get(f"/api/menus/{bogus}/items")
    assert list_resp.status_code == 404

    create_resp = await client.post(
        f"/api/menus/{bogus}/items", json={"label": "x", "cut_id": "ribeye"}
    )
    assert create_resp.status_code == 409


async def test_menu_patch_lww_409(auth_client) -> None:
    client, _, _ = await auth_client()
    create = await client.post("/api/menus", json={"name": "M"})
    menu_id = create.json()["id"]
    persisted_updated_at = create.json()["updated_at"]
    # Pass a stale updated_at
    from datetime import datetime
    stale = (datetime.fromisoformat(persisted_updated_at) - timedelta(hours=1)).isoformat()
    resp = await client.patch(
        f"/api/menus/{menu_id}",
        json={"name": "stale", "updated_at": stale},
    )
    assert resp.status_code == 409


async def test_menu_since_filter(auth_client) -> None:
    client, _, _ = await auth_client()
    r1 = await client.post("/api/menus", json={"name": "A"})
    cutoff = r1.json()["updated_at"]
    await asyncio.sleep(0.01)
    r2 = await client.post("/api/menus", json={"name": "B"})
    assert r2.status_code == 201

    resp = await client.get("/api/menus", params={"since": cutoff})
    names = [r["name"] for r in resp.json()["rows"]]
    assert "B" in names
