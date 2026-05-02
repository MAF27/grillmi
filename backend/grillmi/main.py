import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import ORJSONResponse

from grillmi.config import get_settings
from grillmi.logging import configure_logging
from grillmi.middleware import register_middleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(json=True)
    cleanup_task = asyncio.create_task(_hourly_session_cleanup())
    auto_end_task = asyncio.create_task(_grillade_auto_end_sweep())
    try:
        yield
    finally:
        for task in (cleanup_task, auto_end_task):
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass


async def _hourly_session_cleanup() -> None:
    from grillmi.db import async_session_maker
    from grillmi.repos.sessions_repo import cleanup_expired

    while True:
        try:
            async with async_session_maker()() as session:
                await cleanup_expired(session)
                await session.commit()
        except Exception:  # pragma: no cover - background task survives errors
            import structlog

            structlog.get_logger().exception("session_cleanup_failed")
        await asyncio.sleep(3600)


async def _grillade_auto_end_sweep() -> None:
    from datetime import datetime, timedelta, timezone

    import structlog

    from grillmi.config import get_settings
    from grillmi.db import async_session_maker
    from grillmi.repos.grilladen_repo import sweep_stale_running

    settings = get_settings()
    while True:
        try:
            async with async_session_maker()() as session:
                cutoff = datetime.now(timezone.utc) - timedelta(
                    hours=settings.GRILLADE_STALE_AFTER_HOURS
                )
                ended = await sweep_stale_running(session, cutoff)
                await session.commit()
                if ended:
                    structlog.get_logger().info(
                        "grillade_auto_end_sweep",
                        count=len(ended),
                        ids=[str(row.id) for row in ended],
                    )
        except Exception:  # pragma: no cover - background task survives errors
            structlog.get_logger().exception("grillade_auto_end_failed")
        await asyncio.sleep(settings.GRILLADE_AUTO_END_INTERVAL_SECONDS)


def create_app() -> FastAPI:
    settings = get_settings()
    if settings.OPENAPI_ENABLED:
        app = FastAPI(
            title="Grillmi API",
            default_response_class=ORJSONResponse,
            lifespan=lifespan,
        )
    else:
        app = FastAPI(
            title="Grillmi API",
            default_response_class=ORJSONResponse,
            docs_url=None,
            redoc_url=None,
            openapi_url=None,
            lifespan=lifespan,
        )

    register_middleware(app)

    from grillmi.routes.auth import router as auth_router
    from grillmi.routes.favorites import router as favorites_router
    from grillmi.routes.grilladen import router as grilladen_router
    from grillmi.routes.health import router as health_router
    from grillmi.routes.menus import router as menus_router
    from grillmi.routes.settings import router as settings_router
    from grillmi.routes.sync import router as sync_router

    app.include_router(health_router, prefix="/api")
    app.include_router(auth_router, prefix="/api/auth")
    app.include_router(grilladen_router, prefix="/api/grilladen")
    app.include_router(menus_router, prefix="/api/menus")
    app.include_router(favorites_router, prefix="/api/favorites")
    app.include_router(settings_router, prefix="/api/settings")
    app.include_router(sync_router, prefix="/api/sync")

    return app


app = create_app()
