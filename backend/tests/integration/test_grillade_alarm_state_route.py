from __future__ import annotations


async def test_alarm_state_round_trips(auth_client) -> None:
    client, _, _ = await auth_client()

    create_resp = await client.post("/api/grilladen", json={"name": "G", "status": "running"})
    assert create_resp.status_code == 201, create_resp.text
    grillade_id = create_resp.json()["id"]

    item_resp = await client.post(
        f"/api/grilladen/{grillade_id}/items",
        json={
            "label": "Ribeye",
            "cut_id": "ribeye",
            "cook_seconds_min": 240,
            "cook_seconds_max": 360,
            "flip_fraction": "0.5",
            "rest_seconds": 120,
        },
    )
    assert item_resp.status_code == 201, item_resp.text
    body = item_resp.json()
    assert body["alarm_state"] == {}
    item_id = body["id"]

    patch_resp = await client.patch(
        f"/api/grilladen/{grillade_id}/items/{item_id}",
        json={"alarm_state": {"flip": "2026-05-02T19:30:00+00:00", "ready": None}},
    )
    assert patch_resp.status_code == 200, patch_resp.text
    assert patch_resp.json()["alarm_state"] == {
        "flip": "2026-05-02T19:30:00+00:00",
        "ready": None,
    }

    list_resp = await client.get(f"/api/grilladen/{grillade_id}/items")
    assert list_resp.status_code == 200
    rows = list_resp.json()["rows"]
    assert len(rows) == 1
    assert rows[0]["alarm_state"]["flip"] == "2026-05-02T19:30:00+00:00"


async def test_alarm_state_rejects_unknown_kinds(auth_client) -> None:
    client, _, _ = await auth_client()

    create_resp = await client.post("/api/grilladen", json={"name": "G", "status": "running"})
    grillade_id = create_resp.json()["id"]

    item_resp = await client.post(
        f"/api/grilladen/{grillade_id}/items",
        json={
            "label": "Ribeye",
            "cut_id": "ribeye",
            "cook_seconds_min": 240,
            "cook_seconds_max": 360,
            "flip_fraction": "0.5",
            "rest_seconds": 120,
            "alarm_state": {"bogus": "2026-01-01T00:00:00+00:00", "flip": "2026-05-02T19:00:00+00:00"},
        },
    )
    assert item_resp.status_code == 201, item_resp.text
    assert item_resp.json()["alarm_state"] == {"flip": "2026-05-02T19:00:00+00:00"}
