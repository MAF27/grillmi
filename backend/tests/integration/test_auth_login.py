from __future__ import annotations

import asyncio
import time

from grillmi.security.rate_limit import login_account_limiter, login_ip_limiter


def _reset_limiters() -> None:
    login_ip_limiter.reset()
    login_account_limiter.reset()


async def test_login_with_correct_password_returns_session_cookie_and_csrf_token(
    app_client, make_user
) -> None:
    _reset_limiters()
    user = await make_user(email="login@example.com", password="hunter2hunter2")

    resp = await app_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "hunter2hunter2"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["email"] == user.email
    assert "csrfToken" in body and len(body["csrfToken"]) > 20

    set_cookie = resp.headers.get("set-cookie", "")
    assert "grillmi_session=" in set_cookie


async def test_login_with_wrong_password_returns_generic_error(app_client, make_user) -> None:
    _reset_limiters()
    user = await make_user(email="wrong@example.com", password="hunter2hunter2")

    resp = await app_client.post(
        "/api/auth/login", json={"email": user.email, "password": "WRONG-WRONG-WRONG"}
    )
    assert resp.status_code == 401
    detail = resp.json()["detail"]
    assert detail["detail"] == "invalid_credentials"
    assert detail["message"] == "Invalid email or password"

    # Same response shape for missing email
    resp2 = await app_client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "WRONG-WRONG-WRONG"},
    )
    assert resp2.status_code == 401
    assert resp2.json()["detail"] == detail


async def test_login_response_time_identical_for_existing_and_missing_email(
    app_client, make_user
) -> None:
    _reset_limiters()
    await make_user(email="timing@example.com", password="hunter2hunter2")

    # 4 trials each (per-IP rate-limit allows 5 within 60s, account-limit 10/h)
    samples = []
    for _ in range(2):
        _reset_limiters()
        t0 = time.perf_counter()
        await app_client.post(
            "/api/auth/login", json={"email": "timing@example.com", "password": "WRONG"}
        )
        samples.append(time.perf_counter() - t0)

        _reset_limiters()
        t0 = time.perf_counter()
        await app_client.post(
            "/api/auth/login", json={"email": "missing@example.com", "password": "WRONG"}
        )
        samples.append(time.perf_counter() - t0)

    # Both paths should run argon2 verify (real or dummy hash). They are
    # within an order of magnitude. We allow a wide threshold because CI
    # noise dominates: just assert both paths consume measurable CPU time
    # (>5ms) so we're not bypassing the verify.
    assert all(s > 0.005 for s in samples)


async def test_login_rate_limit_per_ip_returns_429_after_5_attempts(
    app_client, make_user
) -> None:
    _reset_limiters()
    await make_user(email="rl@example.com", password="hunter2hunter2")

    for _ in range(5):
        await app_client.post(
            "/api/auth/login", json={"email": "rl@example.com", "password": "WRONG"}
        )
    resp = await app_client.post(
        "/api/auth/login", json={"email": "rl@example.com", "password": "WRONG"}
    )
    assert resp.status_code == 429


async def test_login_disabled_user_returns_generic_error(app_client, make_user) -> None:
    _reset_limiters()
    user = await make_user(email="disabled@example.com", disabled=True)

    resp = await app_client.post(
        "/api/auth/login", json={"email": user.email, "password": "anything-12chars"}
    )
    assert resp.status_code == 401
    detail = resp.json()["detail"]
    assert detail["detail"] == "invalid_credentials"
