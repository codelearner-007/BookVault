"""Bank account service: CRUD and audit (system accounts are seeded with the business, B2)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError
from app.core.pagination import PageParams
from app.models.bank_account import BankAccount
from app.repositories.bank_account_repository import BankAccountRepository
from app.schemas.request.bank_account import BankAccountCreate, BankAccountUpdate
from app.schemas.response.bank_account import BankAccountListResponse, BankAccountResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.versioning import apply_versioned_update, check_version

ENTITY = "BankAccount"


class BankAccountService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = BankAccountRepository(session)
        self.audit = AuditService(session)

    async def _get_or_404(self, business_id: str, bank_account_id: str) -> BankAccount:
        account = await self.repo.get(business_id, bank_account_id)
        if account is None:
            raise ResourceNotFoundError(ENTITY, bank_account_id)
        return account

    async def list_page(self, business_id: str, params: PageParams) -> BankAccountListResponse:
        rows, total, balance = await self.repo.list_page(business_id, params.offset, params.page_size)
        return BankAccountListResponse.build(
            [BankAccountResponse.model_validate(a) for a in rows], total, params.page, params.page_size,
            coa_total=balance,
        )

    async def get(self, business_id: str, bank_account_id: str) -> BankAccountResponse:
        return BankAccountResponse.model_validate(await self._get_or_404(business_id, bank_account_id))

    async def create(self, ctx: BusinessContext, body: BankAccountCreate) -> BankAccountResponse:
        account = BankAccount(
            business_id=ctx.business_id,
            name=body.name,
            opening_balance=body.opening_balance,
            current_balance=body.opening_balance,
            description=body.description,
        )
        await self.repo.add(account)
        after = BankAccountResponse.model_validate(account)
        await self.audit.record(ctx.user_id, "create", ENTITY, account.id, ctx.business_id, after=after)
        return after

    async def update(
        self, ctx: BusinessContext, bank_account_id: str, body: BankAccountUpdate
    ) -> BankAccountResponse:
        account = await self._get_or_404(ctx.business_id, bank_account_id)
        before = BankAccountResponse.model_validate(account)
        apply_versioned_update(account, body, required=("name",))
        await self.repo.save(account)
        after = BankAccountResponse.model_validate(account)
        await self.audit.record(ctx.user_id, "update", ENTITY, account.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def delete(self, ctx: BusinessContext, bank_account_id: str, version: int) -> None:
        account = await self._get_or_404(ctx.business_id, bank_account_id)
        check_version(account, version)
        before = BankAccountResponse.model_validate(account)
        await self.repo.delete(account)
        await self.audit.record(ctx.user_id, "delete", ENTITY, bank_account_id, ctx.business_id,
                                before=before)
