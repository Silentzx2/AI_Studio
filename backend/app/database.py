
from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()

# Determine database type and use appropriate drivers
database_url = settings.database_url
if database_url.startswith("sqlite://") or database_url.startswith("sqlite+aiosqlite://"):
    # SQLite: use aiosqlite for async, bare sqlite for sync
    # Handle both bare sqlite:// and already formatted sqlite+aiosqlite://
    if "+aiosqlite" in database_url:
        async_db_url = database_url  # Already has correct async driver
        sync_db_url = database_url.replace("+aiosqlite", "")  # Remove async driver for sync
    else:
        async_db_url = database_url.replace("sqlite://", "sqlite+aiosqlite://")
        sync_db_url = database_url  # Keep bare sqlite:// for sync engine
elif database_url.startswith("postgresql://") or database_url.startswith("postgresql+asyncpg://"):
    # PostgreSQL: use asyncpg for async, psycopg2 for sync
    # Handle both bare postgresql:// and already formatted postgresql+asyncpg://
    if "+asyncpg" in database_url:
        async_db_url = database_url  # Already has correct async driver
        sync_db_url = database_url.replace("+asyncpg", "+psycopg2")  # Convert to sync driver
    else:
        async_db_url = database_url.replace("postgresql://", "postgresql+asyncpg://")
        sync_db_url = database_url.replace("postgresql://", "postgresql+psycopg2://")
else:
    # Handle other cases or fallback
    async_db_url = database_url
    sync_db_url = database_url.replace("+asyncpg", "+psycopg2")

# Async engine
engine = create_async_engine(
    async_db_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Sync engine for celery workers
sync_engine = create_engine(
    sync_db_url,
    echo=settings.debug,
    pool_pre_ping=True,
)

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