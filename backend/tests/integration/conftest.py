from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest


@pytest.fixture
async def make_user(db_session):
    """Factory for creating users. Defaults to a hashed password; pass
    `disabled=True` for the `!disabled_*` placeholder pattern from admin-init."""
    from grillmi.models import User
    from grillmi.security.argon2 import hash_password

    async def _make(
        email: str = "user@example.com",
        password: str = "hunter2hunter2",
        *,
        disabled: bool = False,
    ) -> User:
        if disabled:
            password_hash = "!disabled_" + "ab" * 8
        else:
            password_hash = await hash_password(password)
        user = User(email=email, password_hash=password_hash)
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    return _make


@pytest.fixture
async def two_users(make_user) -> AsyncIterator:
    a = await make_user(email="a@example.com")
    b = await make_user(email="b@example.com")
    yield a, b


@pytest.fixture
async def auth_client(app_client, db_session, make_user):
    """Returns a callable that creates a session for the given (or default) user
    and attaches the session cookie + CSRF header to the shared httpx client."""
    from grillmi.repos.sessions_repo import create_session

    async def _auth_client(user=None, password: str = "hunter2hunter2"):
        if user is None:
            user = await make_user(password=password)
        created = await create_session(
            db_session, user_id=user.id, ip="127.0.0.1", user_agent="pytest"
        )
        await db_session.commit()
        app_client.cookies.set("grillmi_session", created.token)
        app_client.headers["X-CSRFToken"] = created.csrf_token
        return app_client, user, created

    return _auth_client


@pytest.fixture
async def clean_audit_log(db_session):
    from sqlalchemy import delete

    from grillmi.models import AuditLog

    yield
    await db_session.execute(delete(AuditLog))
    await db_session.commit()


@pytest.fixture(autouse=True)
def smtp_outbox(monkeypatch) -> list[dict[str, Any]]:
    """Replace `aiosmtplib.send` with an in-memory recorder. Returns the list
    of messages so a test can assert on `to`, `subject`, `body`."""
    outbox: list[dict[str, Any]] = []

    async def fake_send(msg, **kwargs):
        text_part = ""
        html_part = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_maintype() == "multipart":
                    continue
                content = part.get_content()
                if part.get_content_subtype() == "html":
                    html_part = content
                else:
                    text_part = content
        else:
            text_part = msg.get_content()
        outbox.append(
            {
                "to": msg["To"],
                "from": msg["From"],
                "subject": msg["Subject"],
                "body": text_part,
                "html": html_part,
                "kwargs": kwargs,
            }
        )
        return None, ""

    monkeypatch.setattr("aiosmtplib.send", fake_send)
    monkeypatch.setattr("grillmi.email.sender.aiosmtplib.send", fake_send)
    return outbox


@pytest.fixture
def smtp_outbox_fail(monkeypatch):
    async def fake_send(msg, **kwargs):
        raise RuntimeError("smtp connection refused")

    monkeypatch.setattr("aiosmtplib.send", fake_send)
    monkeypatch.setattr("grillmi.email.sender.aiosmtplib.send", fake_send)
    return None
