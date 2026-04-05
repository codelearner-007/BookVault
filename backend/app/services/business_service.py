"""Business service — business logic layer for the businesses feature."""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.repositories.business_repository import BusinessRepository
from app.schemas.response.business import BusinessListResponse, BusinessResponse


class BusinessService:
    """Service containing all business logic for the businesses feature."""

    def __init__(self, session: AsyncSession) -> None:
        self.repo = BusinessRepository(session)

    async def list_by_owner(self, owner_id: str) -> BusinessListResponse:
        """Return active businesses owned by the given user with total count."""
        items = await self.repo.list_by_owner(owner_id)
        total = await self.repo.count_by_owner(owner_id)
        return BusinessListResponse(
            items=[BusinessResponse.model_validate(b) for b in items],
            total=total,
        )

    async def list_deleted_by_owner(self, owner_id: str) -> BusinessListResponse:
        """Return soft-deleted businesses owned by the given user with total count."""
        items = await self.repo.list_deleted_by_owner(owner_id)
        total = await self.repo.count_deleted_by_owner(owner_id)
        return BusinessListResponse(
            items=[BusinessResponse.model_validate(b) for b in items],
            total=total,
        )

    async def create(
        self,
        owner_id: str,
        name: str,
        country: str | None,
    ) -> BusinessResponse:
        """Create a new business and return its representation."""
        business = Business(name=name, country=country, owner_id=owner_id)
        created = await self.repo.create(business)
        return BusinessResponse.model_validate(created)

    async def get(self, business_id: str) -> BusinessResponse:
        """Return a single business by ID, raising 404 if absent."""
        business = await self.repo.get(business_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )
        return BusinessResponse.model_validate(business)

    async def delete(self, business_id: str) -> None:
        """Soft-delete a business by setting deleted_at, raising 404 if absent."""
        business = await self.repo.get(business_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )
        business.deleted_at = datetime.now(timezone.utc)
        await self.repo.session.flush()
        await self.repo.session.refresh(business)

    async def restore(self, business_id: str) -> BusinessResponse:
        """Restore a soft-deleted business by clearing deleted_at, raising 404 if absent."""
        business = await self.repo.get(business_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )
        business.deleted_at = None
        await self.repo.session.flush()
        await self.repo.session.refresh(business)
        return BusinessResponse.model_validate(business)
