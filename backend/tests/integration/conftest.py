from __future__ import annotations

from collections.abc import AsyncIterator

import pytest


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
