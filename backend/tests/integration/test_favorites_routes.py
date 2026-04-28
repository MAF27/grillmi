from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta


async def test_favorites_full_lifecycle(auth_client) -> None:
    client, _, _ = await auth_client()

    create = await client.post(
        "/api/favorites",
        json={"label": "Steak Fav", "cut_id": "ribeye", "thickness_cm": "2.5"},
    )
    assert create.status_code == 201
    fav = create.json()
    fav_id = fav["id"]

    got = await client.get(f"/api/favorites/{fav_id}")
    assert got.status_code == 200

    lst = await client.get("/api/favorites")
    assert any(r["id"] == fav_id for r in lst.json()["rows"])

    patch = await client.patch(
        f"/api/favorites/{fav_id}", json={"label": "Premium Steak Fav"}
    )
    assert patch.status_code == 200
    assert patch.json()["label"] == "Premium Steak Fav"

    delete = await client.delete(f"/api/favorites/{fav_id}")
    assert delete.status_code == 204


async def test_favorite_not_found(auth_client) -> None:
    client, _, _ = await auth_client()
    bogus = uuid.uuid4()
    assert (await client.get(f"/api/favorites/{bogus}")).status_code == 404
    assert (await client.patch(f"/api/favorites/{bogus}", json={"label": "x"})).status_code == 404
    assert (await client.delete(f"/api/favorites/{bogus}")).status_code == 404


async def test_favorite_patch_lww(auth_client) -> None:
    client, _, _ = await auth_client()
    create = await client.post("/api/favorites", json={"label": "F", "cut_id": "ribeye"})
    fav_id = create.json()["id"]
    persisted_updated_at = create.json()["updated_at"]
    stale = (datetime.fromisoformat(persisted_updated_at) - timedelta(hours=1)).isoformat()
    resp = await client.patch(
        f"/api/favorites/{fav_id}", json={"label": "stale", "updated_at": stale}
    )
    assert resp.status_code == 409


async def test_favorite_since_filter(auth_client) -> None:
    client, _, _ = await auth_client()
    r1 = await client.post("/api/favorites", json={"label": "A", "cut_id": "ribeye"})
    cutoff = r1.json()["updated_at"]
    await asyncio.sleep(0.01)
    r2 = await client.post("/api/favorites", json={"label": "B", "cut_id": "ribeye"})
    assert r2.status_code == 201

    resp = await client.get("/api/favorites", params={"since": cutoff})
    labels = [r["label"] for r in resp.json()["rows"]]
    assert "B" in labels
