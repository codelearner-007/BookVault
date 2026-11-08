"""Database session management with connection pooling and per-transaction RLS context."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# session.info keys read at the start of every transaction (B0.4, platform-model 5.2)
REQUEST_USER_KEY = "app_user_id"
DB_ROLE_KEY = "db_role"  # tests only: SET LOCAL ROLE for a session bound to a postgres connection

_SET_CONTEXT = text("SELECT set_config('app.user_id', :user_id, true)")


@event.listens_for(Session, "after_begin")
def _apply_rls_context(session: Session, _transaction, connection) -> None:
    """SET LOCAL the verified caller for RLS at the start of each transaction.

    Transaction-scoped, so a pooled connection never carries a previous caller; a
    session without a caller sets '' and the policies see no tenant rows.
    """
    role = session.info.get(DB_ROLE_KEY)
    if role:
        connection.exec_driver_sql(f'SET LOCAL ROLE "{role}"')
    connection.execute(_SET_CONTEXT, {"user_id": session.info.get(REQUEST_USER_KEY) or ""})


def bind_request_user(session: AsyncSession, user_id: str | None) -> None:
    """Attach the verified JWT subject (never client input) to the session."""
    session.sync_session.info[REQUEST_USER_KEY] = str(user_id) if user_id else None


class SessionManager:
    """Manages database connections and sessions."""

    def __init__(self) -> None:
        """Initialize the session manager with connection pool."""
        database_url = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

        self.engine: AsyncEngine = create_async_engine(
            database_url,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=30,
            pool_recycle=1800,
            pool_pre_ping=True,
            echo=settings.DB_ECHO,
        )

        self.async_session_maker = sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    @asynccontextmanager
    async def session(self, user_id: str | None = None) -> AsyncGenerator[AsyncSession, None]:
        """Transactional scope; `user_id` is the verified caller the RLS policies see."""
        async with self.async_session_maker() as session:
            bind_request_user(session, user_id)
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    async def close(self) -> None:
        """Close all database connections."""
        await self.engine.dispose()


# Global session manager instance
_session_manager: SessionManager | None = None


def get_session_manager() -> SessionManager:
    """Get or create the global session manager."""
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager
