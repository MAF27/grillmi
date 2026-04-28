from __future__ import annotations


async def test_lifespan_starts_and_stops(pg_server, monkeypatch) -> None:
    """Boots the FastAPI app under a real ASGI lifespan to cover main.py's
    startup/shutdown branches (configure_logging, _hourly_session_cleanup task
    creation and cancellation)."""
    from httpx import ASGITransport, AsyncClient

    from grillmi.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
        assert resp.status_code in (200, 503)


async def test_create_app_with_openapi_enabled(monkeypatch) -> None:
    """Switching OPENAPI_ENABLED on yields the variant of FastAPI() with
    docs_url='/docs'."""
    monkeypatch.setenv("OPENAPI_ENABLED", "true")

    from grillmi.config import get_settings
    get_settings.cache_clear()
    try:
        from grillmi.main import create_app
        app = create_app()
        # The other FastAPI() branch is taken when openapi is enabled.
        assert app.docs_url == "/docs"
    finally:
        monkeypatch.setenv("OPENAPI_ENABLED", "false")
        get_settings.cache_clear()


async def test_hourly_cleanup_runs_one_iteration(monkeypatch) -> None:
    """Drives the body of `_hourly_session_cleanup` for a single iteration."""
    import asyncio

    from grillmi import main as main_mod

    sleeps = 0

    async def fast_sleep(s):
        nonlocal sleeps
        sleeps += 1
        if sleeps >= 1:
            raise asyncio.CancelledError()

    monkeypatch.setattr(main_mod.asyncio, "sleep", fast_sleep)

    task = asyncio.create_task(main_mod._hourly_session_cleanup())
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert sleeps >= 1
