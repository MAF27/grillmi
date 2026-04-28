import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from grillmi.db import async_session_maker
from grillmi.logging import get_audit_logger
from grillmi.models import AuditLog


async def record(
    *,
    action: str,
    user_id: uuid.UUID | None = None,
    email: str | None = None,
    ip: str | None = None,
    success: bool,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> None:
    """Fire-and-forget: writes to audit_log table and emits a structlog INFO line."""
    factory = session_factory or async_session_maker()

    async def _do_write() -> None:
        try:
            async with factory() as session:
                row = AuditLog(
                    user_id=user_id,
                    email=email,
                    action=action,
                    ip_address=ip,
                    success=success,
                )
                session.add(row)
                await session.commit()
        except Exception:
            get_audit_logger().exception(
                "audit_write_failed", action=action, email=email, success=success
            )

    asyncio.create_task(_do_write())
    get_audit_logger().info(
        action,
        action=action,
        user_id=str(user_id) if user_id else None,
        email=email,
        ip=ip,
        success=success,
    )
