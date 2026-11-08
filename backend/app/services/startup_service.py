"""Startup checks: route access pairs against the areas seed, bootstrap email setting (D-29)."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import REGISTERED_ACCESS_PAIRS
from app.services.access_service import AccessService
from app.services.managed_user_service import ManagedUserService

logger = logging.getLogger(__name__)


async def run_startup_checks(session: AsyncSession) -> None:
    invalid = await AccessService(session).invalid_route_pairs(REGISTERED_ACCESS_PAIRS)
    if invalid:
        raise RuntimeError(f"Routes declare (area, right) pairs that do not exist: {invalid}")
    stored = await ManagedUserService(session).sync_bootstrap_email(
        settings.BOOTSTRAP_SUPER_ADMIN_EMAIL
    )
    if stored is None:
        logger.warning(
            "BOOTSTRAP_SUPER_ADMIN_EMAIL is not set: nobody can become super admin by signing up"
        )
