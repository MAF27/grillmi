from __future__ import annotations

import asyncio
import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from grillmi.models import (
    AuditLog,
    Favorite,
    Grillade,
    Menu,
    PasswordResetToken,
    Session as SessionRow,
    User,
)
from grillmi.repos.sessions_repo import create_session
from grillmi.security.rate_limit import login_account_limiter, login_ip_limiter
from grillmi.services.account_access import (
    AccountAccess,
    AuthFailure,
    AuthSuccess,
    PasswordSetResult,
)


def _hash_token(raw: str) -> bytes:
    return hashlib.sha256(raw.encode("utf-8")).digest()


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    login_ip_limiter.reset()
    login_account_limiter.reset()
    yield
    login_ip_limiter.reset()
    login_account_limiter.reset()


async def test_authenticate_returns_failure_on_unknown_email_and_still_spends_argon2_time(
    db_session,
):
    started = time.monotonic()
    result = await AccountAccess.authenticate(
        db_session, email="nope@example.com", password="hunter2hunter2", ip="127.0.0.1", user_agent="ua"
    )
    elapsed = time.monotonic() - started
    assert isinstance(result, AuthFailure)
    # _DUMMY_HASH dummy verify spends real Argon2 time even with no user.
    assert elapsed > 0.001


async def test_authenticate_returns_failure_on_disabled_hash_prefix(db_session, make_user):
    await make_user(email="disabled@example.com", disabled=True)
    result = await AccountAccess.authenticate(
        db_session, email="disabled@example.com", password="any-password-12c", ip="127.0.0.1", user_agent="ua"
    )
    assert isinstance(result, AuthFailure)


async def test_authenticate_returns_success_and_creates_session_on_valid_credentials(
    db_session, make_user
):
    user = await make_user(email="valid@example.com", password="hunter2hunter2")
    result = await AccountAccess.authenticate(
        db_session, email="valid@example.com", password="hunter2hunter2", ip="127.0.0.1", user_agent="ua"
    )
    assert isinstance(result, AuthSuccess)
    assert result.user_id == user.id
    assert result.user_email == user.email
    assert result.session_token
    assert result.session_csrf_token

    rows = (
        await db_session.execute(select(SessionRow).where(SessionRow.user_id == user.id))
    ).scalars().all()
    assert len(rows) == 1


async def test_authenticate_rehashes_when_argon2_parameters_bumped(db_session, make_user):
    user = await make_user(email="rehash@example.com", password="hunter2hunter2")
    original_hash = user.password_hash

    with patch("grillmi.services.account_access.check_needs_rehash", return_value=True):
        result = await AccountAccess.authenticate(
            db_session,
            email="rehash@example.com",
            password="hunter2hunter2",
            ip="127.0.0.1",
            user_agent="ua",
        )
    assert isinstance(result, AuthSuccess)
    refreshed = await db_session.get(User, user.id)
    assert refreshed.password_hash != original_hash


async def test_authenticate_writes_audit_log_on_success_and_on_failure(db_session, make_user):
    await make_user(email="audit@example.com", password="hunter2hunter2")
    await AccountAccess.authenticate(
        db_session, email="audit@example.com", password="hunter2hunter2", ip="127.0.0.1", user_agent="ua"
    )
    await AccountAccess.authenticate(
        db_session, email="audit@example.com", password="wrong-password", ip="127.0.0.1", user_agent="ua"
    )
    # audit_log_repo.record is fire-and-forget; let the background task land.
    await asyncio.sleep(0.1)
    rows = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "login"))
    ).scalars().all()
    assert any(r.success for r in rows)
    assert any(not r.success for r in rows)


async def test_authenticate_raises_rate_limit_when_per_ip_window_exceeded(db_session, make_user):
    await make_user(email="iplimit@example.com", password="hunter2hunter2")
    for i in range(5):
        await AccountAccess.authenticate(
            db_session,
            email=f"iplimit{i}@example.com",
            password="wrong",
            ip="9.9.9.9",
            user_agent="ua",
        )
    with pytest.raises(HTTPException) as exc:
        await AccountAccess.authenticate(
            db_session, email="iplimit@example.com", password="hunter2hunter2", ip="9.9.9.9", user_agent="ua"
        )
    assert exc.value.status_code == 429


async def test_authenticate_raises_rate_limit_when_per_account_window_exceeded(db_session, make_user):
    await make_user(email="acclimit@example.com", password="hunter2hunter2")
    for i in range(10):
        await AccountAccess.authenticate(
            db_session,
            email="acclimit@example.com",
            password="wrong",
            ip=f"10.0.0.{i}",
            user_agent="ua",
        )
    with pytest.raises(HTTPException) as exc:
        await AccountAccess.authenticate(
            db_session, email="acclimit@example.com", password="hunter2hunter2", ip="10.0.0.99", user_agent="ua"
        )
    assert exc.value.status_code == 429


async def test_request_password_reset_writes_reset_token_row_and_sends_email(
    db_session, make_user, smtp_outbox
):
    user = await make_user(email="reset@example.com")
    await AccountAccess.request_password_reset(db_session, email="reset@example.com", ip="127.0.0.1")
    rows = (
        await db_session.execute(
            select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].kind == "reset"
    assert any(m["to"] == user.email for m in smtp_outbox)


async def test_request_password_reset_writes_audit_log_only_on_unknown_email_branch(
    db_session, smtp_outbox
):
    await AccountAccess.request_password_reset(
        db_session, email="ghost@example.com", ip="127.0.0.1"
    )
    await asyncio.sleep(0.1)
    rows = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.action == "forgot_password")
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].success is False
    assert rows[0].email == "ghost@example.com"
    assert smtp_outbox == []


async def test_request_password_reset_with_ip_none_does_not_crash(
    db_session, make_user, smtp_outbox
):
    """admin_reset CLI passes ip=None. The audit log row records None; rate
    limiting (none today) trivially skips."""
    await make_user(email="cli@example.com")
    await AccountAccess.request_password_reset(db_session, email="cli@example.com", ip=None)
    await asyncio.sleep(0.1)
    rows = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.action == "forgot_password")
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].ip_address is None


async def test_set_password_rejects_hibp_positive_password_with_422(db_session, make_user):
    user = await make_user(email="hibp@example.com")
    raw = secrets.token_urlsafe(32)
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw),
            kind="reset",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
    )
    await db_session.commit()
    with patch("grillmi.services.account_access.check_password", return_value=True):
        with pytest.raises(HTTPException) as exc:
            await AccountAccess.set_password(
                db_session, raw_token=raw, new_password="leaked-pw-12c", ip="127.0.0.1", user_agent="ua"
            )
    assert exc.value.status_code == 422
    assert exc.value.detail == "password_breached"


async def test_set_password_consumes_reset_token_atomically_and_rejects_second_use(
    db_session, make_user
):
    user = await make_user(email="atomic@example.com")
    raw = secrets.token_urlsafe(32)
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw),
            kind="reset",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
    )
    await db_session.commit()
    with patch("grillmi.services.account_access.check_password", return_value=False):
        first = await AccountAccess.set_password(
            db_session, raw_token=raw, new_password="atomic-pw-12c", ip="127.0.0.1", user_agent="ua"
        )
        assert isinstance(first, PasswordSetResult)
        with pytest.raises(HTTPException) as exc:
            await AccountAccess.set_password(
                db_session, raw_token=raw, new_password="another-pw-12c", ip="127.0.0.1", user_agent="ua"
            )
    assert exc.value.status_code == 410


async def test_set_password_wipes_all_sessions_for_the_user(db_session, make_user):
    user = await make_user(email="wipe@example.com")
    pre = await create_session(db_session, user_id=user.id, ip="127.0.0.1", user_agent="ua")
    await db_session.commit()

    raw = secrets.token_urlsafe(32)
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw),
            kind="reset",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
    )
    await db_session.commit()
    with patch("grillmi.services.account_access.check_password", return_value=False):
        await AccountAccess.set_password(
            db_session, raw_token=raw, new_password="wiped-pw-12c", ip="127.0.0.1", user_agent="ua"
        )
    surviving = (
        await db_session.execute(
            select(SessionRow).where(SessionRow.user_id == user.id, SessionRow.token == pre.token)
        )
    ).scalar_one_or_none()
    assert surviving is None


async def test_set_password_auto_creates_session_for_invitation_but_not_for_reset(
    db_session, make_user
):
    user = await make_user(email="invite@example.com", disabled=True)
    raw_invite = secrets.token_urlsafe(32)
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw_invite),
            kind="invitation",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    await db_session.commit()

    with patch("grillmi.services.account_access.check_password", return_value=False):
        result = await AccountAccess.set_password(
            db_session, raw_token=raw_invite, new_password="invite-pw-12c", ip="127.0.0.1", user_agent="ua"
        )
    assert result.kind == "invitation"
    assert result.session_token is not None

    user2 = await make_user(email="reset2@example.com")
    raw_reset = secrets.token_urlsafe(32)
    db_session.add(
        PasswordResetToken(
            user_id=user2.id,
            token_hash=_hash_token(raw_reset),
            kind="reset",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
    )
    await db_session.commit()

    with patch("grillmi.services.account_access.check_password", return_value=False):
        result2 = await AccountAccess.set_password(
            db_session, raw_token=raw_reset, new_password="reset-pw-12c", ip="127.0.0.1", user_agent="ua"
        )
    assert result2.kind == "reset"
    assert result2.session_token is None


async def test_delete_account_cascades_to_owned_rows(db_session, make_user):
    user = await make_user(email="cascade@example.com")
    db_session.add(Grillade(user_id=user.id, name="g", status="planned"))
    db_session.add(Menu(user_id=user.id, name="m"))
    db_session.add(Favorite(user_id=user.id, label="f", cut_id="rinds-entrecote"))
    await create_session(db_session, user_id=user.id, ip="127.0.0.1", user_agent="ua")
    await db_session.commit()

    await AccountAccess.delete_account(
        db_session, user_id=user.id, user_email=user.email, ip="127.0.0.1"
    )

    for Model in (Grillade, Menu, Favorite, SessionRow, PasswordResetToken):
        rows = (
            await db_session.execute(select(Model).where(Model.user_id == user.id))
        ).scalars().all()
        assert rows == []


async def test_create_user_with_invitation_creates_user_and_token_and_is_idempotent(
    db_session, smtp_outbox
):
    result = await AccountAccess.create_user_with_invitation(
        db_session, email="new@example.com", first_name="Marco"
    )
    assert result is not None
    assert any(m["to"] == "new@example.com" for m in smtp_outbox)
    user = (
        await db_session.execute(select(User).where(User.email == "new@example.com"))
    ).scalar_one()
    assert user.password_hash.startswith("!disabled_")
    tokens = (
        await db_session.execute(
            select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
    ).scalars().all()
    assert len(tokens) == 1
    assert tokens[0].kind == "invitation"

    again = await AccountAccess.create_user_with_invitation(
        db_session, email="new@example.com", first_name="Marco"
    )
    assert again is None
