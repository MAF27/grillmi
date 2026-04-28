from __future__ import annotations

import asyncio
import uuid


async def test_grillade_create_get_patch_with_dates(auth_client) -> None:
    client, _, _ = await auth_client()

    create = await client.post(
        "/api/grilladen",
        json={
            "name": "with timing",
            "status": "planned",
            "target_finish_at": "2026-04-28T18:00:00+00:00",
        },
    )
    assert create.status_code == 201
    gid = create.json()["id"]

    got = await client.get(f"/api/grilladen/{gid}")
    assert got.status_code == 200
    assert got.json()["target_finish_at"] is not None

    patch = await client.patch(
        f"/api/grilladen/{gid}",
        json={"started_at": "2026-04-28T17:30:00+00:00", "status": "running"},
    )
    assert patch.status_code == 200
    assert patch.json()["status"] == "running"


async def test_items_unknown_returns_404_or_409(auth_client) -> None:
    client, _, _ = await auth_client()
    g = await client.post("/api/grilladen", json={"name": "G", "status": "planned"})
    gid = g.json()["id"]
    bogus_item = uuid.uuid4()

    p = await client.patch(
        f"/api/grilladen/{gid}/items/{bogus_item}", json={"label": "x"}
    )
    assert p.status_code == 404
    d = await client.delete(f"/api/grilladen/{gid}/items/{bogus_item}")
    assert d.status_code == 404


async def test_grilladen_list_full_pull(auth_client) -> None:
    client, _, _ = await auth_client()

    for status in ("finished", "finished", "planned"):
        await client.post("/api/grilladen", json={"name": status, "status": status})

    resp = await client.get("/api/grilladen")
    assert resp.status_code == 200
    assert len(resp.json()["rows"]) == 3
    assert "server_time" in resp.json()


async def test_items_since_filter(auth_client) -> None:
    client, _, _ = await auth_client()
    g = await client.post("/api/grilladen", json={"name": "G", "status": "planned"})
    gid = g.json()["id"]

    body = {
        "label": "First",
        "cut_id": "ribeye",
        "cook_seconds_min": 60,
        "cook_seconds_max": 120,
        "flip_fraction": "0.5",
        "rest_seconds": 30,
    }
    r1 = await client.post(f"/api/grilladen/{gid}/items", json=body)
    cutoff = r1.json()["updated_at"]
    await asyncio.sleep(0.01)
    r2 = await client.post(
        f"/api/grilladen/{gid}/items", json={**body, "label": "Second"}
    )
    assert r2.status_code == 201

    listed = await client.get(
        f"/api/grilladen/{gid}/items", params={"since": cutoff}
    )
    labels = [r["label"] for r in listed.json()["rows"]]
    assert "Second" in labels
