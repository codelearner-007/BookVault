"""Idempotency key repository."""

from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.idempotency_key import IdempotencyKey

UNIQUE_CONSTRAINT = "idempotency_keys_business_user_key"


class IdempotencyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _match(self, business_id: str | None, user_id: str, key: str):
        business = (
            IdempotencyKey.business_id.is_(None)
            if business_id is None
            else IdempotencyKey.business_id == business_id
        )
        return business, IdempotencyKey.user_id == user_id, IdempotencyKey.key == key

    async def delete_expired(self, business_id: str | None, user_id: str, key: str, now: datetime) -> None:
        await self.session.execute(
            delete(IdempotencyKey).where(
                *self._match(business_id, user_id, key), IdempotencyKey.expires_at <= now
            )
        )

    async def claim(self, values: dict) -> str | None:
        """Insert the key row; None when it already exists (waits for a concurrent holder)."""
        result = await self.session.execute(
            insert(IdempotencyKey)
            .values(**values)
            .on_conflict_do_nothing(constraint=UNIQUE_CONSTRAINT)
            .returning(IdempotencyKey.id)
        )
        return result.scalar_one_or_none()

    async def get(self, business_id: str | None, user_id: str, key: str) -> IdempotencyKey | None:
        result = await self.session.execute(
            select(IdempotencyKey).where(*self._match(business_id, user_id, key))
        )
        return result.scalar_one_or_none()

    async def complete(self, key_id: str, status_code: int, body: dict) -> None:
        row = await self.session.get(IdempotencyKey, key_id)
        row.response_status = status_code
        row.response_body = body
        await self.session.flush()
