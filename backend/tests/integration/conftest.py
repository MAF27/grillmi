from __future__ import annotations

from collections.abc import AsyncIterator

import pytest


@pytest.fixture
async def two_users(db_session) -> AsyncIterator:
    from grillmi.models import User

    a = User(email="a@example.com", password_hash="!disabled_a")
    b = User(email="b@example.com", password_hash="!disabled_b")
    db_session.add_all([a, b])
    await db_session.flush()
    yield a, b
