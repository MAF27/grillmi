from __future__ import annotations

import os
import shutil
import tempfile
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest

# Default env so pure-import tests don't fail. The pg_server fixture overrides
# DATABASE_URL_OVERRIDE for integration tests.
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


def _ensure_pgserver_citext() -> None:
    """pgserver bundles a minimal Postgres without contrib extensions. The
    schema requires `citext`. Inject it from the system's apt cache (Ubuntu's
    postgresql-16 .deb is ABI-compatible with pgserver's bundled 16.2 binary)."""
    import subprocess

    pginstall = Path(__file__).resolve().parent.parent / ".venv" / "lib"
    # Walk venv to find pgserver's pginstall dir (handle py-version variants).
    candidates = list(pginstall.glob("python*/site-packages/pgserver/pginstall"))
    if not candidates:
        return
    install_root = candidates[0]
    ext_dir = install_root / "share" / "postgresql" / "extension"
    lib_dir = install_root / "lib" / "postgresql"
    if (ext_dir / "citext.control").exists() and (lib_dir / "citext.so").exists():
        return

    workdir = Path(tempfile.mkdtemp(prefix="grillmi_citext_"))
    try:
        subprocess.run(
            ["apt", "download", "postgresql-16"],
            cwd=workdir,
            check=True,
            capture_output=True,
        )
        deb = next(workdir.glob("postgresql-16_*.deb"))
        extract = workdir / "extract"
        extract.mkdir()
        subprocess.run(
            ["dpkg-deb", "-x", str(deb), str(extract)],
            check=True,
            capture_output=True,
        )
        for src in (extract / "usr/share/postgresql/16/extension").glob("citext*"):
            shutil.copy2(src, ext_dir / src.name)
        shutil.copy2(extract / "usr/lib/postgresql/16/lib/citext.so", lib_dir / "citext.so")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@pytest.fixture(scope="session")
def pg_server() -> Iterator:
    """Start an embedded Postgres via `pgserver`, create the test database,
    point Settings at it via DATABASE_URL_OVERRIDE, run alembic upgrade head."""
    import pgserver

    _ensure_pgserver_citext()

    pgdata = Path(tempfile.mkdtemp(prefix="grillmi_pgtest_"))
    server = pgserver.get_server(pgdata, cleanup_mode="stop")

    server.psql("CREATE DATABASE grillmi_test;")

    uri = server.get_uri()
    # pgserver URI shape: postgresql://postgres:@/postgres?host=<socket_dir>
    socket_dir = uri.split("host=")[-1]
    db_url = f"postgresql+asyncpg://postgres@/grillmi_test?host={socket_dir}"

    os.environ["DATABASE_URL_OVERRIDE"] = db_url

    from grillmi.config import get_settings
    get_settings.cache_clear()

    from grillmi.db import reset_engine_for_tests
    reset_engine_for_tests()

    from alembic import command
    from alembic.config import Config

    backend_root = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend_root / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_root / "migrations"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")

    try:
        yield server
    finally:
        try:
            server.cleanup()
        finally:
            shutil.rmtree(pgdata, ignore_errors=True)


@pytest.fixture(scope="session")
def postgres_available(pg_server) -> bool:
    return True


@pytest.fixture
async def _engine(pg_server):
    from grillmi.db import engine as get_engine

    return get_engine()


_TRUNCATE_TABLES = (
    "audit_log",
    "password_reset_tokens",
    "sessions",
    "grillade_items",
    "grilladen",
    "menu_items",
    "menus",
    "favorites",
    "settings",
    "users",
)


@pytest.fixture
async def db_session(_engine) -> AsyncIterator:
    """Per-test session bound to the engine. After the test, every domain table
    is truncated, so CLI sessions, route sessions, and test sessions all see
    the same fresh DB at the start of the next test."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession

    session = AsyncSession(bind=_engine, expire_on_commit=False)
    try:
        yield session
    finally:
        await session.close()
        async with _engine.begin() as conn:
            await conn.execute(
                text(f"TRUNCATE TABLE {', '.join(_TRUNCATE_TABLES)} RESTART IDENTITY CASCADE")
            )


@pytest.fixture
async def app_client(_engine, db_session) -> AsyncIterator:
    """An httpx AsyncClient bound to the FastAPI app. The app uses the same
    engine as `db_session` (configured in the session-scope `pg_server`
    fixture), so routes and tests share the same database."""
    from httpx import ASGITransport, AsyncClient

    from grillmi.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
