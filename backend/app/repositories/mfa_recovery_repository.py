"""2FA recovery codes: data access only (RLS limits every query to the caller's rows)."""

from datetime import datetime, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mfa_recovery_code import MfaRecoveryCode


class MfaRecoveryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def replace_all(self, user_id: str, code_hashes: list[str]) -> None:
        await self.delete_all(user_id)
        self.session.add_all(MfaRecoveryCode(user_id=user_id, code_hash=h) for h in code_hashes)
        await self.session.flush()

    async def delete_all(self, user_id: str) -> None:
        await self.session.execute(delete(MfaRecoveryCode).where(MfaRecoveryCode.user_id == user_id))

    async def consume(self, user_id: str, code_hash: str) -> bool:
        """Mark one unused code as used, atomically; False when no such unused code."""
        result = await self.session.execute(
            update(MfaRecoveryCode)
            .where(
                MfaRecoveryCode.user_id == user_id,
                MfaRecoveryCode.code_hash == code_hash,
                MfaRecoveryCode.used_at.is_(None),
            )
            .values(used_at=datetime.now(timezone.utc))
            .returning(MfaRecoveryCode.id)
        )
        return result.first() is not None

    async def count_unused(self, user_id: str) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(MfaRecoveryCode)
            .where(MfaRecoveryCode.user_id == user_id, MfaRecoveryCode.used_at.is_(None))
        )
        return result.scalar_one()
