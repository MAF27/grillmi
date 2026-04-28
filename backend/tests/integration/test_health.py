from __future__ import annotations

from unittest.mock import patch


async def test_health_returns_200_when_db_and_smtp_reachable(app_client) -> None:
    with patch("grillmi.routes.health._smtp_probe", return_value=None):
        resp = await app_client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] is True
    assert body["smtp_reachable"] is True


async def test_health_returns_503_when_db_unreachable(app_client) -> None:
    """Force the SELECT 1 to raise; the route catches it and returns 503."""
    from grillmi.routes import health as health_module

    real = health_module.text

    def boom(_):
        raise RuntimeError("simulated db outage")

    with patch.object(health_module, "text", boom):
        resp = await app_client.get("/api/health")

    assert resp.status_code == 503
    assert resp.json()["db"] is False
