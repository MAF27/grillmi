from __future__ import annotations

from grillmi.security.rate_limit import login_account_limiter, login_ip_limiter


def _reset_limiters() -> None:
    login_ip_limiter.reset()
    login_account_limiter.reset()


async def test_login_then_me(app_client, make_user) -> None:
    _reset_limiters()
    user = await make_user(email="me@example.com", password="hunter2hunter2")

    login = await app_client.post(
        "/api/auth/login", json={"email": user.email, "password": "hunter2hunter2"}
    )
    assert login.status_code == 200

    me = await app_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == user.email


async def test_me_unauthenticated_returns_401(app_client) -> None:
    resp = await app_client.get("/api/auth/me")
    assert resp.status_code == 401


async def test_logout_with_no_cookie_is_204(app_client) -> None:
    resp = await app_client.post("/api/auth/logout")
    assert resp.status_code == 204


async def test_login_with_bogus_cookie_then_me_401(app_client) -> None:
    app_client.cookies.set("grillmi_session", "totally-bogus-token-not-in-db")
    resp = await app_client.get("/api/auth/me")
    assert resp.status_code == 401


async def test_revoke_current_session_logs_caller_out(auth_client, db_session) -> None:
    client, user, session = await auth_client()
    resp = await client.post(f"/api/auth/sessions/{session.row_id}/revoke")
    assert resp.status_code == 204

    me = await client.get("/api/auth/me")
    assert me.status_code == 401


async def test_revoke_unknown_session_returns_404(auth_client) -> None:
    import uuid
    client, _, _ = await auth_client()
    resp = await client.post(f"/api/auth/sessions/{uuid.uuid4()}/revoke")
    assert resp.status_code == 404


async def test_account_delete_without_csrf_returns_403(auth_client) -> None:
    client, _, _ = await auth_client()
    client.headers.pop("X-CSRFToken", None)
    resp = await client.delete("/api/auth/account")
    assert resp.status_code == 403


async def test_forgot_password_email_failure_returns_502(app_client, make_user, smtp_outbox_fail) -> None:
    user = await make_user(email="boom@example.com")
    resp = await app_client.post(
        "/api/auth/forgot-password", json={"email": user.email}
    )
    assert resp.status_code == 502
