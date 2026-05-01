from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from grillmi.models import PasswordResetToken
from grillmi.repos.sessions_repo import create_session


def _hash_token(raw: str) -> bytes:
    return hashlib.sha256(raw.encode("utf-8")).digest()


async def _seed_token(db_session, user_id, kind: str, expires_in_minutes: int = 30) -> str:
    raw = secrets.token_urlsafe(32)
    db_session.add(
        PasswordResetToken(
            user_id=user_id,
            token_hash=_hash_token(raw),
            kind=kind,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=expires_in_minutes),
        )
    )
    await db_session.commit()
    return raw


async def test_invitation_token_set_password_auto_logs_in(app_client, db_session, make_user) -> None:
    user = await make_user(email="invite@example.com", disabled=True)
    raw = await _seed_token(db_session, user.id, "invitation", expires_in_minutes=72 * 60)

    with patch("grillmi.security.hibp.check_password", return_value=False):
        with patch(
            "grillmi.services.account_access.check_password", return_value=False
        ):
            resp = await app_client.post(
                "/api/auth/set-password",
                json={"token": raw, "password": "long-enough-passw0rd"},
            )
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "invitation"
    assert "csrfToken" in body
    set_cookie = resp.headers.get("set-cookie", "")
    assert "grillmi_session=" in set_cookie


async def test_reset_token_set_password_does_not_auto_log_in(app_client, db_session, make_user) -> None:
    user = await make_user(email="reset@example.com")
    raw = await _seed_token(db_session, user.id, "reset")

    with patch("grillmi.services.account_access.check_password", return_value=False):
        resp = await app_client.post(
            "/api/auth/set-password",
            json={"token": raw, "password": "fresh-new-passw0rd"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "reset"
    assert "csrfToken" not in body
    set_cookie = resp.headers.get("set-cookie", "")
    assert "grillmi_session=" not in set_cookie


async def test_set_password_invalidates_all_existing_sessions(
    app_client, db_session, make_user
) -> None:
    user = await make_user(email="invalidate@example.com")
    # Pre-existing session
    pre = await create_session(db_session, user_id=user.id, ip="127.0.0.1", user_agent="ua")
    await db_session.commit()

    raw = await _seed_token(db_session, user.id, "reset")
    with patch("grillmi.services.account_access.check_password", return_value=False):
        await app_client.post(
            "/api/auth/set-password",
            json={"token": raw, "password": "another-passw0rd"},
        )

    from sqlalchemy import select

    from grillmi.models import Session as SessionRow

    rows = (
        await db_session.execute(select(SessionRow).where(SessionRow.user_id == user.id))
    ).scalars().all()
    # All previously-issued sessions for this user are gone (reset path doesn't
    # auto-log-in, so no replacement session is created either).
    assert all(r.token != pre.token for r in rows)


async def test_set_password_rejects_hibp_match(app_client, db_session, make_user) -> None:
    user = await make_user(email="hibp@example.com")
    raw = await _seed_token(db_session, user.id, "reset")

    with patch("grillmi.services.account_access.check_password", return_value=True):
        resp = await app_client.post(
            "/api/auth/set-password",
            json={"token": raw, "password": "leaked-passw0rd"},
        )
    assert resp.status_code == 422
    assert resp.json()["detail"] == "password_breached"


async def test_token_pages_clear_existing_session_on_load(app_client, db_session, make_user) -> None:
    """The frontend calls POST /api/auth/logout before rendering. We verify the
    server-side endpoint deletes the row + clears the cookie, regardless of
    whether the caller is on a token page."""
    user = await make_user(email="logout-on-load@example.com")
    pre = await create_session(db_session, user_id=user.id, ip="127.0.0.1", user_agent="ua")
    await db_session.commit()

    app_client.cookies.set("grillmi_session", pre.token)
    resp = await app_client.post("/api/auth/logout")
    assert resp.status_code == 204

    from sqlalchemy import select

    from grillmi.models import Session as SessionRow

    row = (
        await db_session.execute(select(SessionRow).where(SessionRow.token == pre.token))
    ).scalar_one_or_none()
    assert row is None


async def test_expired_token_returns_410(app_client, db_session, make_user) -> None:
    user = await make_user(email="expired@example.com")
    raw = secrets.token_urlsafe(32)
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw),
            kind="reset",
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )
    await db_session.commit()

    resp = await app_client.post(
        "/api/auth/set-password", json={"token": raw, "password": "irrelevant-12c"}
    )
    assert resp.status_code == 410
    assert resp.json()["detail"]["error_code"] == "token_expired"


async def test_already_used_token_returns_410(app_client, db_session, make_user) -> None:
    user = await make_user(email="used@example.com")
    raw = secrets.token_urlsafe(32)
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw),
            kind="reset",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            used_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()

    resp = await app_client.post(
        "/api/auth/set-password", json={"token": raw, "password": "irrelevant-12c"}
    )
    assert resp.status_code == 410
    assert resp.json()["detail"]["error_code"] == "token_used"
