from __future__ import annotations

import os
import socket
from collections.abc import AsyncIterator

import pytest

# Provide reasonable defaults for required env vars so test imports don't fail.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("PUBLIC_BASE_URL", "http://localhost:5173")
os.environ.setdefault("DATABASE_HOST", "127.0.0.1")
os.environ.setdefault("DATABASE_PORT", "5432")
os.environ.setdefault("DATABASE_NAME", "grillmi_test")
os.environ.setdefault("DATABASE_USER", "grillmi_test")
os.environ.setdefault("DATABASE_PASSWORD", "grillmi_test")
os.environ.setdefault("SMTP_HOST", "127.0.0.1")
os.environ.setdefault("SMTP_PORT", "2525")
os.environ.setdefault("SMTP_FROM_ADDRESS", "noreply@kraftops.ch")
os.environ.setdefault("HOSTPOINT_SMTP_USER", "test")
os.environ.setdefault("HOSTPOINT_SMTP_PASSWORD", "test")
os.environ.setdefault("OPENAPI_ENABLED", "false")


def _have_postgres() -> bool:
    try:
        sock = socket.create_connection(("127.0.0.1", 5432), timeout=0.5)
        sock.close()
        return True
    except OSError:
        return False


HAVE_POSTGRES = _have_postgres()


@pytest.fixture(scope="session")
def postgres_available() -> bool:
    return HAVE_POSTGRES


def pytest_collection_modifyitems(config, items):
    if HAVE_POSTGRES:
        return
    skip_pg = pytest.mark.skip(reason="postgres not reachable on 127.0.0.1:5432")
    for item in items:
        if "integration" in str(item.fspath):
            item.add_marker(skip_pg)


@pytest.fixture
async def db_session() -> AsyncIterator:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from grillmi.config import get_settings

    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()
