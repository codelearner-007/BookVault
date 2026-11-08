"""Platform settings: read through SECURITY DEFINER functions only (no table grant, B0.4)."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class PlatformSettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_bool(self, key: str) -> bool | None:
        result = await self.session.execute(
            text("SELECT public.platform_setting_bool(:key)"), {"key": key}
        )
        return result.scalar()
