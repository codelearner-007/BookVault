"""Bank account service: CRUD, system COA accounts on the first account, audit."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError
from app.core.pagination import PageParams
from app.models.bank_account import BankAccount
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.coa_repository import CoaRepository
from app.schemas.request.bank_account import BankAccountCreate, BankAccountUpdate
from app.schemas.response.bank_account import BankAccountListResponse, BankAccountResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.versioning import apply_versioned_update, check_version

ENTITY = "BankAccount"

# (name, account_type, group_name, group_panel_type, group_sort_order)
_SYSTEM_ACCOUNTS: list[tuple[str, str, str, str, int]] = [
    ("Cash and Cash Equivalents", "asset", "Assets", "balance_sheet", 0),
    ("Inter Account Transfers", "equity", "Equity", "balance_sheet", 2),
]


class BankAccountService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = BankAccountRepository(session)
        self.coa_repo = CoaRepository(session)
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

    async def _ensure_cash_system_accounts(self, business_id: str) -> None:
        """System COA accounts (and their groups) created with the first bank/cash account."""
        for name, acct_type, group_name, group_panel, group_sort in _SYSTEM_ACCOUNTS:
            if await self.coa_repo.get_account_by_name(business_id, name):
                continue
            group = await self.coa_repo.get_group_by_name(business_id, group_name)
            if not group:
                group = await self.coa_repo.create_group(
                    business_id, group_name, group_panel, None, is_system=True, sort_order=group_sort,
                )
            await self.coa_repo.create_account(
                business_id=business_id, name=name, type_=acct_type, group_id=group.id, is_system=True,
            )

    async def create(self, ctx: BusinessContext, body: BankAccountCreate) -> BankAccountResponse:
        is_first = await self.repo.count_by_business(ctx.business_id) == 0
        account = BankAccount(
            business_id=ctx.business_id,
            name=body.name,
            opening_balance=body.opening_balance,
            current_balance=body.opening_balance,
            description=body.description,
        )
        await self.repo.add(account)
        if is_first:
            await self._ensure_cash_system_accounts(ctx.business_id)
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
