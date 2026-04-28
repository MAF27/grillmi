from __future__ import annotations

from datetime import datetime, timedelta


async def test_settings_get_returns_empty_when_unset(auth_client) -> None:
    client, _, _ = await auth_client()
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json() == {"value": {}, "updated_at": None}


async def test_settings_put_then_get(auth_client) -> None:
    client, _, _ = await auth_client()

    put = await client.put("/api/settings", json={"value": {"theme": "dark", "sound": "on"}})
    assert put.status_code == 200
    assert put.json()["value"] == {"theme": "dark", "sound": "on"}

    got = await client.get("/api/settings")
    assert got.json()["value"] == {"theme": "dark", "sound": "on"}


async def test_settings_put_lww_409(auth_client) -> None:
    client, _, _ = await auth_client()

    first = await client.put("/api/settings", json={"value": {"theme": "dark"}})
    persisted_updated_at = first.json()["updated_at"]
    stale = (datetime.fromisoformat(persisted_updated_at) - timedelta(hours=1)).isoformat()

    resp = await client.put(
        "/api/settings", json={"value": {"theme": "light"}, "updated_at": stale}
    )
    assert resp.status_code == 409


async def test_settings_unauthenticated_returns_401(app_client) -> None:
    assert (await app_client.get("/api/settings")).status_code == 401
    assert (await app_client.put("/api/settings", json={"value": {}})).status_code == 401
