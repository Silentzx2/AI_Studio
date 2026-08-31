
from collections.abc import AsyncGenerator, Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# PostgreSQL only — asyncpg for async, psycopg2 for sync
database_url = settings.database_url
if "+asyncpg" in database_url:
    async_db_url = database_url
    sync_db_url = database_url.replace("+asyncpg", "+psycopg2")
else:
    async_db_url = database_url.replace("postgresql://", "postgresql+asyncpg://")
    sync_db_url = database_url.replace("postgresql://", "postgresql+psycopg2://")

# Async engine — pool sized for concurrent frontend polling + background tasks.
# pool_size=20 handles ~15 concurrent SSE + API requests without contention.
_async_engine_kwargs = {
    "echo": settings.debug,
    "pool_pre_ping": True,
    "pool_size": 20,
    "max_overflow": 30,
    "pool_recycle": 3600,  # Recycle connections hourly to prevent stale connections
    "pool_timeout": 5,  # Fail fast when pool is exhausted
}
# Sync engine for celery workers — explicit pool to avoid exhausting DB
# connections when many workers run concurrently.
_sync_engine_kwargs = {
    "echo": settings.debug,
    "pool_pre_ping": True,
    "pool_size": 5,
    "max_overflow": 10,
    "pool_recycle": 3600,
    "pool_timeout": 5,
}

# Async engine
engine = create_async_engine(async_db_url, **_async_engine_kwargs)

# Sync engine for celery workers
sync_engine = create_engine(sync_db_url, **_sync_engine_kwargs)

# Async session
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
    """Read-only DB session — no COMMIT issued on close."""
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