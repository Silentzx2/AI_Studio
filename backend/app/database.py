
from collections.abc import AsyncGenerator, Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# PostgreSQL only — asyncpg for async, psycopg2 for sync
database_url = settings.database_url

# Handle SSL mode for asyncpg (doesn't support sslmode query param)
# asyncpg uses ssl=False/True/SSLContext instead of sslmode
def _process_db_url(url: str, driver: str) -> tuple[str, dict]:
    """Process database URL for the given driver, handling SSL differences."""
    # Strip sslmode from query params since asyncpg/psycopg2 handle it differently
    if "sslmode=" in url:
        # Extract sslmode value
        sslmode = "disable"
        if "sslmode=" in url:
            import re
            m = re.search(r"[?&]sslmode=([^&]+)", url)
            if m:
                sslmode = m.group(1)
        # Remove sslmode from URL
        url = re.sub(r"[?&]sslmode=[^&]*", "", url)
        url = url.replace("?", "&") if "?" in url else url  # cleanup
        # Remove trailing ? or &
        url = url.rstrip("?&")
    
    # Build connect_args based on driver and sslmode
    connect_args = {}
    if driver == "asyncpg":
        # asyncpg: ssl=False to disable, ssl=True for default, ssl=SSLContext for custom
        if sslmode in ("disable", "allow", "prefer"):
            connect_args["ssl"] = False
        elif sslmode in ("require", "verify-ca", "verify-full"):
            connect_args["ssl"] = True
    elif driver == "psycopg2":
        # psycopg2 uses sslmode in URL or connect_args
        connect_args["sslmode"] = sslmode
    
    return url, connect_args

# Process URLs for both drivers
async_db_url, async_connect_args = _process_db_url(database_url, "asyncpg")
if "+asyncpg" not in async_db_url:
    async_db_url = async_db_url.replace("postgresql://", "postgresql+asyncpg://")

sync_db_url, sync_connect_args = _process_db_url(database_url, "psycopg2")
if "+psycopg2" not in sync_db_url:
    sync_db_url = sync_db_url.replace("postgresql://", "postgresql+psycopg2://")

# Async engine — pool sized for concurrent frontend polling + background tasks.
# pool_size=20 handles ~15 concurrent SSE + API requests without contention.
_async_engine_kwargs = {
    "echo": settings.debug,
    "pool_pre_ping": True,
    "pool_size": 20,
    "max_overflow": 30,
    "pool_recycle": 3600,  # Recycle connections hourly to prevent stale connections
    "pool_timeout": 5,  # Fail fast when pool is exhausted
    "connect_args": async_connect_args,
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
    "connect_args": sync_connect_args,
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