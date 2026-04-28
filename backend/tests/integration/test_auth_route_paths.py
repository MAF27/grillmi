from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from grillmi.models import PasswordResetToken
from grillmi.security.argon2 import hash_password
from grillmi.security.rate_limit import login_account_limiter, login_ip_limiter


def _reset_limiters() -> None:
    login_ip_limiter.reset()
    login_account_limiter.reset()


async def test_login_triggers_rehash_when_params_outdated(
    app_client, db_session, make_user, monkeypatch
) -> None:
    _reset_limiters()
    user = await make_user(email="rehash@example.com", password="hunter2hunter2")

    # Force check_needs_rehash to return True so the route re-hashes the password.
    monkeypatch.setattr("grillmi.routes.auth.check_needs_rehash", lambda h: True)

    pre_hash = user.password_hash
    resp = await app_client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "hunter2hunter2"},
    )
    assert resp.status_code == 200

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from grillmi.db import engine as engine_factory
    from grillmi.models import User

    # Use a fresh session so the identity-map cache from `make_user` doesn't
    # mask the route's UPDATE.
    async with AsyncSession(bind=engine_factory(), expire_on_commit=False) as fresh_session:
        fresh = (
            await fresh_session.execute(select(User).where(User.email == user.email))
        ).scalar_one()
        assert fresh.password_hash != pre_hash


async def test_set_password_unknown_token_returns_410(app_client) -> None:
    raw = secrets.token_urlsafe(32)
    resp = await app_client.post(
        "/api/auth/set-password", json={"token": raw, "password": "abcdefghijkl"}
    )
    assert resp.status_code == 410


async def test_account_delete_audit_records_success(auth_client, db_session) -> None:
    from sqlalchemy import select

    from grillmi.models import AuditLog

    client, user, _ = await auth_client()
    email = user.email
    await client.delete("/api/auth/account")

    # The audit_log row is written via fire-and-forget; wait briefly so the
    # background task completes against the same DB.
    import asyncio
    await asyncio.sleep(0.1)

    rows = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.email == email, AuditLog.action == "account_delete")
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is True


async def test_invitation_set_password_with_existing_session_works(
    app_client, db_session, make_user
) -> None:
    """An unactivated user opens the activation link; the page POSTs logout
    first (no session yet, so 204) then POSTs set-password."""
    user = await make_user(email="freshact@example.com", disabled=True)

    raw = secrets.token_urlsafe(32)
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hashlib.sha256(raw.encode()).digest(),
            kind="invitation",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=72),
        )
    )
    await db_session.commit()

    logout_resp = await app_client.post("/api/auth/logout")
    assert logout_resp.status_code == 204

    with patch("grillmi.routes.auth.check_password", return_value=False):
        resp = await app_client.post(
            "/api/auth/set-password",
            json={"token": raw, "password": "fine-passw0rd-99"},
        )
    assert resp.status_code == 200
