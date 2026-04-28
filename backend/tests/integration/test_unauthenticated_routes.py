from __future__ import annotations


async def test_no_cookie_returns_401_for_protected_endpoints(app_client) -> None:
    for path in (
        "/api/grilladen",
        "/api/menus",
        "/api/favorites",
        "/api/settings",
        "/api/auth/me",
        "/api/auth/sessions",
    ):
        resp = await app_client.get(path)
        assert resp.status_code == 401, path

    # POST endpoints also require auth (check before CSRF).
    for path in (
        "/api/grilladen",
        "/api/menus",
        "/api/favorites",
        "/api/sync/import",
    ):
        resp = await app_client.post(path, json={})
        assert resp.status_code in (401, 403), f"{path} returned {resp.status_code}"
