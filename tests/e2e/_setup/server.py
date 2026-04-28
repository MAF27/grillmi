"""Hermetic FastAPI backend for Playwright e2e.

Boots an embedded Postgres via `pgserver` (same package the integration tests
use), runs `alembic upgrade head` against `grillmi_e2e`, monkeypatches the
email sender into an in-memory outbox, registers the test-only `/api/_test/*`
routes, and serves uvicorn on `127.0.0.1:8001`.

Run from the repo root:
    cd backend && uv run python ../tests/e2e/_setup/server.py

The Playwright `globalSetup` hook spawns this script and polls
`/api/health` until 200 before yielding to the test runner.
"""
from __future__ import annotations

import os
import shutil
import signal
import sys
import tempfile
from pathlib import Path

# Force test mode before the app imports anything that reads settings.
os.environ["APP_ENV"] = "test"
os.environ["PUBLIC_BASE_URL"] = "http://127.0.0.1:5173"
os.environ.setdefault("DATABASE_HOST", "127.0.0.1")
os.environ.setdefault("DATABASE_PORT", "5432")
os.environ["DATABASE_NAME"] = "grillmi_e2e"
os.environ["DATABASE_USER"] = "postgres"
os.environ["DATABASE_PASSWORD"] = "unused"
os.environ.setdefault("SMTP_HOST", "127.0.0.1")
os.environ.setdefault("SMTP_PORT", "2525")
os.environ.setdefault("SMTP_FROM_ADDRESS", "Grillmi <noreply@kraftops.ch>")
os.environ.setdefault("HOSTPOINT_SMTP_USER", "test")
os.environ.setdefault("HOSTPOINT_SMTP_PASSWORD", "test")
os.environ["OPENAPI_ENABLED"] = "true"

BACKEND_PORT = int(os.environ.get("E2E_BACKEND_PORT", "8001"))


def _ensure_pgserver_citext(install_root: Path) -> None:
    """pgserver bundles a minimal Postgres without contrib extensions; the
    schema requires `citext`. Inject it from the system's apt cache."""
    import subprocess

    ext_dir = install_root / "share" / "postgresql" / "extension"
    lib_dir = install_root / "lib" / "postgresql"
    if (ext_dir / "citext.control").exists() and (lib_dir / "citext.so").exists():
        return

    workdir = Path(tempfile.mkdtemp(prefix="grillmi_e2e_citext_"))
    try:
        subprocess.run(
            ["apt", "download", "postgresql-16"], cwd=workdir, check=True, capture_output=True
        )
        deb = next(workdir.glob("postgresql-16_*.deb"))
        extract = workdir / "extract"
        extract.mkdir()
        subprocess.run(
            ["dpkg-deb", "-x", str(deb), str(extract)], check=True, capture_output=True
        )
        for src in (extract / "usr/share/postgresql/16/extension").glob("citext*"):
            shutil.copy2(src, ext_dir / src.name)
        shutil.copy2(extract / "usr/lib/postgresql/16/lib/citext.so", lib_dir / "citext.so")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _start_pg() -> tuple["object", Path]:
    import pgserver

    pginstall_root = Path(pgserver.__file__).parent / "pginstall"
    _ensure_pgserver_citext(pginstall_root)

    pgdata = Path(tempfile.mkdtemp(prefix="grillmi_e2e_pgdata_"))
    server = pgserver.get_server(pgdata, cleanup_mode="stop")
    server.psql("CREATE DATABASE grillmi_e2e;")

    uri = server.get_uri()
    socket_dir = uri.split("host=")[-1]
    db_url = f"postgresql+asyncpg://postgres@/grillmi_e2e?host={socket_dir}"
    os.environ["DATABASE_URL_OVERRIDE"] = db_url

    from alembic import command
    from alembic.config import Config

    backend_root = Path(__file__).resolve().parents[3] / "backend"
    cfg = Config(str(backend_root / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_root / "migrations"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")

    return server, pgdata


def _patch_email_sender() -> list[dict]:
    """Replace `grillmi.email.sender.send` with an in-memory recorder. The
    `/api/_test/outbox` route reads from this list."""
    outbox: list[dict] = []
    from grillmi.email import sender as email_sender_mod

    async def fake_send(to: str, subject: str, body_text: str) -> None:
        outbox.append({"to": to, "subject": subject, "body": body_text})

    email_sender_mod.send = fake_send  # type: ignore[assignment]
    return outbox


def _install_test_routes(app, outbox: list[dict]) -> None:
    """Register `/api/_test/*` endpoints used only when APP_ENV=test."""
    from datetime import datetime, timedelta, timezone

    from fastapi import APIRouter, Body, Response
    from sqlalchemy import delete, select, text, update

    router = APIRouter(tags=["_test"])

    _TRUNCATE = (
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

    @router.post("/_test/reset")
    async def reset() -> Response:
        from grillmi.db import async_session_maker
        from grillmi.security.rate_limit import login_account_limiter, login_ip_limiter

        async with async_session_maker()() as session:
            await session.execute(
                text(f"TRUNCATE TABLE {', '.join(_TRUNCATE)} RESTART IDENTITY CASCADE")
            )
            await session.commit()
        login_ip_limiter.reset()
        login_account_limiter.reset()
        outbox.clear()
        return Response(status_code=204)

    @router.get("/_test/outbox")
    async def get_outbox() -> list[dict]:
        return list(outbox)

    @router.post("/_test/outbox/clear")
    async def clear_outbox() -> Response:
        outbox.clear()
        return Response(status_code=204)

    @router.post("/_test/admin_init")
    async def admin_init(payload: dict = Body(...)) -> dict:
        """Same logic as `grillmi-admin-init` but returns the activation token
        in the response so tests can construct the activation URL without
        round-tripping through the outbox."""
        import hashlib
        import secrets

        from grillmi.db import async_session_maker
        from grillmi.email.templates import render_activation
        from grillmi.email import sender as email_sender_mod
        from grillmi.models import PasswordResetToken, User

        email = payload["email"]
        async with async_session_maker()() as session:
            existing = (
                await session.execute(select(User).where(User.email == email))
            ).scalar_one_or_none()
            if existing is None:
                user = User(email=email, password_hash="!disabled_" + "ab" * 8)
                session.add(user)
                await session.flush()
                user_id = user.id
            else:
                user_id = existing.id

            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode()).digest()
            row = PasswordResetToken(
                user_id=user_id,
                token_hash=token_hash,
                kind="invitation",
                expires_at=datetime.now(timezone.utc) + timedelta(hours=72),
            )
            session.add(row)
            await session.commit()

        from grillmi.config import get_settings

        public = get_settings().PUBLIC_BASE_URL.rstrip("/")
        link = f"{public}/set-password?token={raw_token}"
        subject, body = render_activation(link, 72, email)
        await email_sender_mod.send(email, subject, body)
        return {"email": email, "token": raw_token, "link": link}

    @router.post("/_test/forge_token")
    async def forge_token(payload: dict = Body(...)) -> dict:
        """Create a token row with a custom `expires_at` / `used_at` for
        token-edge tests (expired, already-consumed)."""
        import hashlib
        import secrets

        from grillmi.db import async_session_maker
        from grillmi.models import PasswordResetToken, User

        email = payload["email"]
        kind = payload.get("kind", "invitation")
        offset_seconds = int(payload.get("offset_seconds", 0))
        used = bool(payload.get("used", False))

        async with async_session_maker()() as session:
            user = (
                await session.execute(select(User).where(User.email == email))
            ).scalar_one_or_none()
            if user is None:
                user = User(email=email, password_hash="!disabled_" + "ab" * 8)
                session.add(user)
                await session.flush()

            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode()).digest()
            now = datetime.now(timezone.utc)
            row = PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                kind=kind,
                expires_at=now + timedelta(seconds=offset_seconds),
                used_at=now if used else None,
            )
            session.add(row)
            await session.commit()
        return {"token": raw_token}

    @router.post("/_test/forge_session")
    async def forge_session(payload: dict = Body(...)) -> dict:
        """Create a session row whose `expires_at` is set to the past so a
        cookie holding its token returns 401 on the next request."""
        import secrets

        from grillmi.db import async_session_maker
        from grillmi.models import Session, User

        email = payload["email"]
        age_hours = float(payload.get("age_hours", 0))
        async with async_session_maker()() as session:
            user = (
                await session.execute(select(User).where(User.email == email))
            ).scalar_one_or_none()
            if user is None:
                raise ValueError(f"user {email!r} not found")
            now = datetime.now(timezone.utc)
            row = Session(
                user_id=user.id,
                token=secrets.token_urlsafe(32),
                csrf_token=secrets.token_urlsafe(32),
                created_at=now - timedelta(hours=age_hours),
                last_active_at=now - timedelta(hours=age_hours),
                expires_at=now - timedelta(hours=age_hours - 24),
                ip_address="127.0.0.1",
                user_agent="pytest-forged",
            )
            session.add(row)
            await session.commit()
        return {"token": row.token, "csrf_token": row.csrf_token}

    @router.post("/_test/clear_rate_limits")
    async def clear_rate_limits() -> Response:
        from grillmi.security.rate_limit import login_account_limiter, login_ip_limiter

        login_ip_limiter.reset()
        login_account_limiter.reset()
        return Response(status_code=204)

    app.include_router(router, prefix="/api")


def main() -> int:
    pg_server, pgdata = _start_pg()
    outbox = _patch_email_sender()

    # Force a fresh settings cache after the env vars are in place.
    from grillmi.config import get_settings

    get_settings.cache_clear()

    from grillmi.db import reset_engine_for_tests

    reset_engine_for_tests()

    from grillmi.main import app

    _install_test_routes(app, outbox)

    pid_file = Path(__file__).parent / ".backend.pid"
    pid_file.write_text(str(os.getpid()))

    def _shutdown(*_):
        try:
            pg_server.cleanup()
        except Exception:
            pass
        shutil.rmtree(pgdata, ignore_errors=True)
        try:
            pid_file.unlink()
        except FileNotFoundError:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=BACKEND_PORT, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
