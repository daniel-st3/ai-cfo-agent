from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

# Always resolve the SQLite file relative to the project root (parent of api/)
_PROJECT_ROOT = Path(__file__).parent.parent
_DEFAULT_DB = _PROJECT_ROOT / "ai_cfo.db"

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# ---------------------------------------------------------------------------
# Engine & session factory — module-level singletons
# ---------------------------------------------------------------------------

_engine = None
_session_factory = None


def _build_url() -> str:
    """Return the async database URL.

    Priority:
      1. DATABASE_URL env var (PostgreSQL via asyncpg or SQLite via aiosqlite)
      2. Local SQLite fallback — zero-config for local development
    """
    url = os.getenv("DATABASE_URL", "")
    if not url:
        return f"sqlite+aiosqlite:///{_DEFAULT_DB}"

    # Render / Heroku often set postgresql:// — upgrade to asyncpg driver
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # Some providers set postgres:// (Heroku legacy)
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    return url


def _get_engine():
    global _engine
    if _engine is None:
        url = _build_url()
        connect_args: dict = {}
        if url.startswith("sqlite"):
            # SQLite requires check_same_thread=False for async usage
            connect_args = {"check_same_thread": False}
        _engine = create_async_engine(
            url,
            echo=False,
            connect_args=connect_args,
        )
    return _engine


def _get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            _get_engine(),
            expire_on_commit=False,
            class_=AsyncSession,
        )
    return _session_factory


# ---------------------------------------------------------------------------
# DatabaseManager — used by CFOGraphRunner and API lifespan
# ---------------------------------------------------------------------------


class DatabaseManager:
    """Thin wrapper around the async session factory.

    Usage::

        async with db_manager.session() as session:
            result = await session.execute(...)
    """

    def __init__(self, engine=None) -> None:
        self._engine = engine or _get_engine()
        self._session_factory = async_sessionmaker(
            self._engine,
            expire_on_commit=False,
            class_=AsyncSession,
        )

    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        async with self._session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise


# ---------------------------------------------------------------------------
# Module-level helpers called by api/main.py lifespan
# ---------------------------------------------------------------------------

_db_manager: DatabaseManager | None = None


def get_db_manager() -> DatabaseManager:
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager


async def init_db() -> None:
    """Create all tables (idempotent — safe to call on every startup)."""
    from api.models import Base

    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Dispose the engine connection pool on shutdown."""
    global _engine, _db_manager
    if _engine is not None:
        await _engine.dispose()
        _engine = None
    _db_manager = None


async def check_db_connection() -> bool:
    """Ping the database and return True if reachable."""
    try:
        engine = _get_engine()
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


__all__ = [
    "DatabaseManager",
    "get_db_manager",
    "init_db",
    "close_db",
    "check_db_connection",
]
