"""Database setup for the new FastAPI backend."""

from collections.abc import AsyncGenerator, Generator
import re

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# PostgreSQL only — asyncpg for async, psycopg2 for sync
database_url = settings.database_url


def _process_db_url(url: str, driver: str) -> tuple[str, dict]:
    """Process database URL for the given driver, handling SSL differences."""
    sslmode = "disable"

    if "sslmode=" in url:
        import re
        m = re.search(r"[?&]sslmode=([^&]+)", url)
        if m:
            sslmode = m.group(1)
        url = re.sub(r"[?&]sslmode=[^&]*", "", url)
        url = url.replace("?", "&") if "?" in url else url
        url = url.rstrip("?&")

    connect_args = {}
    if driver == "asyncpg":
        if sslmode in ("disable", "allow", "prefer"):
            connect_args["ssl"] = False
        elif sslmode in ("require", "verify-ca", "verify-full"):
            connect_args["ssl"] = True
    elif driver == "psycopg2":
        connect_args["sslmode"] = sslmode

    return url, connect_args


async_db_url, async_connect_args = _process_db_url(database_url, "asyncpg")
if "+asyncpg" not in async_db_url:
    async_db_url = async_db_url.replace("postgresql://", "postgresql+asyncpg://")

sync_db_url, sync_connect_args = _process_db_url(database_url, "psycopg2")
if "+psycopg2" not in sync_db_url:
    sync_db_url = re.sub(r"postgresql(\+\w+)?://", "postgresql+psycopg2://", sync_db_url)

# Async engine
_async_engine_kwargs = {
    "echo": settings.debug,
    "pool_pre_ping": True,
    "pool_size": 20,
    "max_overflow": 30,
    "pool_recycle": 3600,
    "pool_timeout": 30,
    "connect_args": async_connect_args,
}

# ponytail: sync engine kept for Alembic migrations & get_sync_db()
_sync_engine_kwargs = {
    "echo": settings.debug,
    "pool_pre_ping": True,
    "pool_size": 10,
    "max_overflow": 20,
    "pool_recycle": 3600,
    "pool_timeout": 30,
    "connect_args": sync_connect_args,
}

engine = create_async_engine(async_db_url, **_async_engine_kwargs)
sync_engine = create_engine(sync_db_url, **_sync_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

SessionLocal = sessionmaker(
    bind=sync_engine,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_readonly() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def get_sync_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()