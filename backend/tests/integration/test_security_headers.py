from __future__ import annotations

from unittest.mock import patch


async def test_response_carries_required_headers(app_client) -> None:
    with patch("grillmi.routes.health._smtp_probe", return_value=None):
        resp = await app_client.get("/api/health")
    h = resp.headers
    assert h.get("x-frame-options") == "DENY"
    assert h.get("x-content-type-options") == "nosniff"
    assert h.get("referrer-policy") == "strict-origin-when-cross-origin"
    csp = h.get("content-security-policy", "")
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
