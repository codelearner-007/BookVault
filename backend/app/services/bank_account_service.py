"""Bank and cash accounts (B3): the sub-ledger of Cash & cash equivalents.

Balances are read from the ledger (PR-12): actual = Σ journal lines of the account;
pending = posted documents marked "cleared later" without a clear date; cleared = actual - pending.
A referenced account cannot be deleted (409, AC-23); an unused one is soft-deleted.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, LedgerValidationError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.bank_account import BankAccount
from app.repositories.bank_account_repository import BankAccountRepository
from app.schemas.request.bank_account import BankAccountCreate, BankAccountUpdate
from app.schemas.response.bank_account import (
    BankAccountListResponse,
    BankAccountResponse,
    BankBalances,
    BankTransactionItem,
    BankTransactionListResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import PostingService
from app.services.versioning import apply_versioned_update, check_version

ENTITY = "BankAccount"
ZERO = Decimal(0)


def _balances(row, dp: int) -> BankBalances:
    actual, deposits, withdrawals = (row.actual, row.pending_deposits, row.pending_withdrawals) if row else (ZERO,) * 3
    return BankBalances(
        cleared_balance=round_money(actual - deposits - withdrawals, dp),
        pending_deposits=round_money(deposits, dp),
        pending_withdrawals=round_money(withdrawals, dp),
        actual_balance=round_money(actual, dp),
    )


class BankAccountService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = BankAccountRepository(session)
        self.posting = PostingService(session)
        self.audit = AuditService(session)

    async def _get_or_404(self, business_id: str, bank_account_id: str, *, for_update: bool = False) -> BankAccount:
        account = await self.repo.get(business_id, bank_account_id, for_update=for_update) \
            if is_uuid(bank_account_id) else None
        if account is None:
            raise ResourceNotFoundError(ENTITY, bank_account_id)
        return account

    async def _response(self, account: BankAccount, balances: dict | None = None) -> BankAccountResponse:
        balances = balances if balances is not None else await self.repo.balances(account.business_id)
        dp = await self.posting.decimals(account.business_id)
        return BankAccountResponse(
            id=account.id, name=account.name, code=account.code, description=account.description,
            can_have_pending=account.can_have_pending, is_inactive=account.is_inactive, version=account.version,
            created_at=account.created_at, updated_at=account.updated_at,
            **_balances(balances.get(account.id), dp).model_dump(),
        )

    # ---------------------------------------------------------------- reads
    async def list_page(self, business_id: str, params: PageParams,
                        include_inactive: bool = True) -> BankAccountListResponse:
        rows, total = await self.repo.list_page(business_id, params.offset, params.page_size, include_inactive)
        balances = await self.repo.balances(business_id)
        dp = await self.posting.decimals(business_id)
        each = [_balances(b, dp) for b in balances.values()]
        totals = BankBalances(**{
            name: sum((getattr(b, name) for b in each), ZERO) for name in BankBalances.model_fields
        })
        return BankAccountListResponse.build(
            [await self._response(a, balances) for a in rows], total, params.page, params.page_size, totals=totals,
        )

    async def get(self, business_id: str, bank_account_id: str) -> BankAccountResponse:
        return await self._response(await self._get_or_404(business_id, bank_account_id))

    async def transactions(self, business_id: str, bank_account_id: str, params: PageParams,
                           date_from: date | None = None, date_to: date | None = None) -> BankTransactionListResponse:
        """The account's register: every document that moved it, newest first, with the running
        ledger balance after each one (up to today unless a range is given)."""
        if date_from and date_to and date_from > date_to:
            raise LedgerValidationError("The start date is after the end date", "invalid_date_range")
        await self._get_or_404(business_id, bank_account_id)
        rows, total = await self.repo.transactions_page(
            business_id, bank_account_id, date_from, date_to or date.today(), params.offset, params.page_size)
        dp = await self.posting.decimals(business_id)
        items = [BankTransactionItem.model_validate({
            **r._mapping, "amount": round_money(r.amount, dp), "balance": round_money(r.balance, dp),
            "received": round_money(max(r.amount, ZERO), dp), "paid": round_money(max(-r.amount, ZERO), dp),
        }) for r in rows]
        return BankTransactionListResponse.build(items, total, params.page, params.page_size)

    # ---------------------------------------------------------------- writes
    async def create(self, ctx: BusinessContext, body: BankAccountCreate) -> BankAccountResponse:
        account = BankAccount(business_id=ctx.business_id, **body.model_dump())
        await self.repo.add(account)
        after = await self._response(account)
        await self.audit.record(ctx.user_id, "create", ENTITY, account.id, ctx.business_id, after=after)
        return after

    async def update(
        self, ctx: BusinessContext, bank_account_id: str, body: BankAccountUpdate
    ) -> BankAccountResponse:
        account = await self._get_or_404(ctx.business_id, bank_account_id, for_update=True)
        before = await self._response(account)
        if body.can_have_pending is False and account.can_have_pending:
            if (await self.repo.usage(ctx.business_id, account.id)).has_clears_later:
                raise ConflictError("Documents on this account are marked as cleared later",
                                    "pending_transactions_exist")
        apply_versioned_update(account, body, required=("name", "can_have_pending", "is_inactive"))
        await self.repo.save(account)
        after = await self._response(account)
        await self.audit.record(ctx.user_id, "update", ENTITY, account.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def delete(self, ctx: BusinessContext, bank_account_id: str, version: int) -> None:
        """Soft delete of an unused account; a referenced one stays (409, AC-23)."""
        account = await self._get_or_404(ctx.business_id, bank_account_id, for_update=True)
        check_version(account, version)
        if (await self.repo.usage(ctx.business_id, account.id)).in_use:
            raise ConflictError("This account has transactions and cannot be deleted; mark it inactive instead",
                                "bank_account_in_use")
        before = await self._response(account)
        account.deleted_at = datetime.now(timezone.utc)
        await self.repo.save(account)
        await self.audit.record(ctx.user_id, "delete", ENTITY, bank_account_id, ctx.business_id, before=before)
