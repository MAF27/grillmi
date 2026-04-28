from __future__ import annotations

import uuid
from datetime import datetime, timedelta


async def test_grillade_get_unknown_returns_404(auth_client) -> None:
    client, _, _ = await auth_client()
    resp = await client.get(f"/api/grilladen/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_grillade_patch_unknown_returns_404(auth_client) -> None:
    client, _, _ = await auth_client()
    resp = await client.patch(
        f"/api/grilladen/{uuid.uuid4()}", json={"name": "x"}
    )
    assert resp.status_code == 404


async def test_grillade_delete_unknown_returns_404(auth_client) -> None:
    client, _, _ = await auth_client()
    resp = await client.delete(f"/api/grilladen/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_grillade_items_full_flow(auth_client) -> None:
    client, _, _ = await auth_client()

    create = await client.post(
        "/api/grilladen", json={"name": "G", "status": "planned"}
    )
    gid = create.json()["id"]

    item = await client.post(
        f"/api/grilladen/{gid}/items",
        json={
            "label": "Ribeye",
            "cut_id": "ribeye",
            "cook_seconds_min": 240,
            "cook_seconds_max": 360,
            "flip_fraction": "0.5",
            "rest_seconds": 120,
        },
    )
    assert item.status_code == 201
    iid = item.json()["id"]

    items_resp = await client.get(f"/api/grilladen/{gid}/items")
    assert items_resp.status_code == 200
    assert len(items_resp.json()["rows"]) == 1

    persisted = items_resp.json()["rows"][0]
    stale = (datetime.fromisoformat(persisted["updated_at"]) - timedelta(hours=1)).isoformat()
    bad_patch = await client.patch(
        f"/api/grilladen/{gid}/items/{iid}",
        json={"label": "stale", "updated_at": stale},
    )
    assert bad_patch.status_code == 409

    good_patch = await client.patch(
        f"/api/grilladen/{gid}/items/{iid}",
        json={"label": "Updated"},
    )
    assert good_patch.status_code == 200
    assert good_patch.json()["label"] == "Updated"

    del_item = await client.delete(f"/api/grilladen/{gid}/items/{iid}")
    assert del_item.status_code == 204

    del_grillade = await client.delete(f"/api/grilladen/{gid}")
    assert del_grillade.status_code == 204


async def test_grillade_unknown_parent_items_list_404(auth_client) -> None:
    client, _, _ = await auth_client()
    resp = await client.get(f"/api/grilladen/{uuid.uuid4()}/items")
    assert resp.status_code == 404


async def test_unauthenticated_grilladen_returns_401(app_client) -> None:
    assert (await app_client.get("/api/grilladen")).status_code == 401
    assert (await app_client.post("/api/grilladen", json={"name": "x"})).status_code == 401


async def test_csrf_required_on_grilladen_post(auth_client) -> None:
    client, _, session = await auth_client()
    # Strip the CSRF header to simulate a request without it.
    client.headers.pop("X-CSRFToken", None)
    resp = await client.post("/api/grilladen", json={"name": "x"})
    assert resp.status_code == 403
