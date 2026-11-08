"""COA service — business logic layer for the Chart of Accounts feature."""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.core.ids import is_uuid
from app.repositories.business_repository import BusinessRepository
from app.repositories.coa_repository import CoaRepository
from app.schemas.response.coa import (
    CoaAccountListResponse,
    CoaAccountResponse,
    CoaGroupListResponse,
    CoaGroupResponse,
)


class CoaService:
    """Service containing all business logic for the Chart of Accounts feature."""

    def __init__(self, session: AsyncSession) -> None:
        self.repo = CoaRepository(session)
        self.business_repo = BusinessRepository(session)

    async def _require_business(self, business_id: str, owner_id: str) -> None:
        """Raise HTTP 404 if the business does not exist or is not owned by owner_id."""
        business = await self.business_repo.get_by_owner(business_id, owner_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )

    async def _require_group_in_business(
        self, business_id: str, group_id: str | None, field: str
    ) -> None:
        """Reject a group reference that is not a group of this business (CS-05)."""
        if group_id is None:
            return
        if not is_uuid(group_id) or not await self.repo.get_group(business_id, group_id):
            raise ValidationError("Referenced group not found in this business", field)

    # ------------------------------------------------------------------ Groups

    async def list_groups(self, business_id: str, owner_id: str) -> CoaGroupListResponse:
        """Return all COA groups for the business owned by owner_id."""
        await self._require_business(business_id, owner_id)
        items = await self.repo.list_groups(business_id)
        return CoaGroupListResponse(
            items=[CoaGroupResponse.model_validate(g) for g in items],
            total=len(items),
        )

    async def get_group(
        self, business_id: str, group_id: str, owner_id: str
    ) -> CoaGroupResponse:
        """Return a single COA group, raising 404 if not found or business not owned."""
        await self._require_business(business_id, owner_id)
        group = await self.repo.get_group(business_id, group_id)
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="COA group not found",
            )
        return CoaGroupResponse.model_validate(group)

    async def create_group(
        self,
        business_id: str,
        owner_id: str,
        name: str,
        type_: str,
        parent_group_id: str | None,
    ) -> CoaGroupResponse:
        """Create a new COA group under the given business."""
        await self._require_business(business_id, owner_id)
        await self._require_group_in_business(business_id, parent_group_id, "parent_group_id")
        group = await self.repo.create_group(
            business_id, name, type_, parent_group_id, is_system=False
        )
        return CoaGroupResponse.model_validate(group)

    async def update_group(
        self,
        business_id: str,
        group_id: str,
        owner_id: str,
        name: str | None,
        parent_group_id: str | None,
    ) -> CoaGroupResponse:
        """Update a COA group, raising 403 if system or 404 if not found."""
        await self._require_business(business_id, owner_id)
        group = await self.repo.get_group(business_id, group_id)
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="COA group not found",
            )
        if group.is_system:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This group is system-managed and cannot be modified.",
            )
        await self._require_group_in_business(business_id, parent_group_id, "parent_group_id")
        updated = await self.repo.update_group(business_id, group_id, name, parent_group_id)
        return CoaGroupResponse.model_validate(updated)

    async def delete_group(
        self, business_id: str, group_id: str, owner_id: str
    ) -> None:
        """Delete a COA group, raising 403 if system or 404 if not found."""
        await self._require_business(business_id, owner_id)
        group = await self.repo.get_group(business_id, group_id)
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="COA group not found",
            )
        if group.is_system:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This group is system-managed and cannot be deleted.",
            )
        await self.repo.delete_group(business_id, group_id)

    async def reorder_groups(
        self,
        business_id: str,
        owner_id: str,
        type_: str,
        parent_group_id: str | None,
        ids: list[str],
    ) -> None:
        """Reorder COA groups within a type/parent bucket for the given business."""
        await self._require_business(business_id, owner_id)
        await self.repo.reorder_groups(business_id, type_, parent_group_id, ids)

    # ---------------------------------------------------------------- Accounts

    async def list_accounts(
        self, business_id: str, owner_id: str
    ) -> CoaAccountListResponse:
        """Return all COA accounts for the business owned by owner_id."""
        await self._require_business(business_id, owner_id)
        items = await self.repo.list_accounts(business_id)
        return CoaAccountListResponse(
            items=[CoaAccountResponse.model_validate(a) for a in items],
            total=len(items),
        )

    async def get_account(
        self, business_id: str, account_id: str, owner_id: str
    ) -> CoaAccountResponse:
        """Return a single COA account, raising 404 if not found or business not owned."""
        await self._require_business(business_id, owner_id)
        account = await self.repo.get_account(business_id, account_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="COA account not found",
            )
        return CoaAccountResponse.model_validate(account)

    async def create_account(
        self,
        business_id: str,
        owner_id: str,
        name: str,
        code: str | None,
        group_id: str | None,
        cash_flow_category: str | None,
        type_: str,
        description: str | None,
        is_active: bool,
    ) -> CoaAccountResponse:
        """Create a new COA account under the given business."""
        await self._require_business(business_id, owner_id)
        await self._require_group_in_business(business_id, group_id, "group_id")
        account = await self.repo.create_account(
            business_id=business_id,
            name=name,
            code=code,
            group_id=group_id,
            cash_flow_category=cash_flow_category,
            type_=type_,
            is_system=False,
            description=description,
            is_active=is_active,
        )
        return CoaAccountResponse.model_validate(account)

    async def update_account(
        self,
        business_id: str,
        account_id: str,
        owner_id: str,
        name: str | None,
        code: str | None,
        update_code: bool,
        group_id: str | None,
        update_group_id: bool,
        cash_flow_category: str | None,
        update_cash_flow: bool,
        type_: str | None,
        description: str | None,
        is_active: bool | None,
    ) -> CoaAccountResponse:
        """Update a COA account, raising 403 if system or 404 if not found."""
        await self._require_business(business_id, owner_id)
        account = await self.repo.get_account(business_id, account_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="COA account not found",
            )
        if account.is_system:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is system-managed and cannot be modified.",
            )
        if update_group_id:
            await self._require_group_in_business(business_id, group_id, "group_id")
        updated = await self.repo.update_account(
            business_id,
            account_id,
            name,
            group_id,
            update_group_id,
            cash_flow_category,
            update_cash_flow,
            code,
            update_code,
            type_,
            description=description,
            is_active=is_active,
        )
        return CoaAccountResponse.model_validate(updated)

    async def delete_account(
        self, business_id: str, account_id: str, owner_id: str
    ) -> None:
        """Delete a COA account, raising 403 if system or 404 if not found."""
        await self._require_business(business_id, owner_id)
        account = await self.repo.get_account(business_id, account_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="COA account not found",
            )
        if account.is_system:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is system-managed and cannot be deleted.",
            )
        await self.repo.delete_account(business_id, account_id)

    async def reorder_accounts(
        self,
        business_id: str,
        owner_id: str,
        group_id: str | None,
        ids: list[str],
    ) -> None:
        """Reorder COA accounts within a group for the given business."""
        await self._require_business(business_id, owner_id)
        await self.repo.reorder_accounts(business_id, group_id, ids)

    async def seed_default_coa(self, business_id: str) -> None:
        """Seed the default system COA for a newly created business (no ownership check)."""
        await self.repo.seed_default_coa(business_id)
