from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from grillmi.config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_session_maker: async_sessionmaker[AsyncSession] | None = None


def engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            get_settings().DATABASE_URL,
            pool_size=5,
            max_overflow=5,
            pool_pre_ping=True,
        )
    return _engine


def async_session_maker() -> async_sessionmaker[AsyncSession]:
    global _session_maker
    if _session_maker is None:
        _session_maker = async_sessionmaker(engine(), expire_on_commit=False, class_=AsyncSession)
    return _session_maker


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_maker()() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


def reset_engine_for_tests() -> None:
    global _engine, _session_maker
    _engine = None
    _session_maker = None
