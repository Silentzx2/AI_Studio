import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    try:
        fileConfig(config.config_file_name)
    except Exception:
        # Ignore missing logging sections in alembic.ini
        pass

# Import all models so Alembic can detect them
from app.database import Base
from app.models import *  # noqa: F401, F403

target_metadata = Base.metadata


def get_database_url():
    """Get database URL, preferring the active environment over the ini default.

    Resolution order:
    1. $DATABASE_URL (explicit override — set by colab.sh/native startup)
    2. settings.database_url (reads project-root .env, the same source the
       app uses — always resolves to a real host like 127.0.0.1 in native/Colab)
    3. alembic.ini sqlalchemy.url (last resort; the shipped value targets a
       Docker Compose 'postgres' service name that does not exist outside Docker)

    Previously the ini value was tried before the settings value, so on the
    Colab restart path (which does not source .env) alembic fell back to the
    Docker hostname and failed with socket.gaierror on every attempt.
    """
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        try:
            from app.config import get_settings

            database_url = get_settings().database_url
        except Exception:
            database_url = None
    if not database_url:
        database_url = config.get_main_option("sqlalchemy.url")

    if "+asyncpg" in database_url:
        return database_url
    return database_url.replace("postgresql://", "postgresql+asyncpg://")


def run_migrations_offline() -> None:
    """Run migrations in offline mode."""
    url = get_database_url()

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    """Run migrations with a live connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create async engine and run migrations."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_database_url()

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in online mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()