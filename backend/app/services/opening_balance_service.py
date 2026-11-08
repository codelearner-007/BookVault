"""Starting balances (posting-rules §10, domain-model §3.5, D-35): one opening entry per record.

Each balance-sheet account's starting balance is its own `opening_balance` document whose
two-line entry (source `opening`) is dated books_start_date - 1 with Retained earnings as the
only offset. Changing it voids that record's document (reversal) and posts a new one; moving
the books start date re-posts every live opening document at the new date. All audited.
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import LedgerValidationError, ResourceNotFoundError
from app.core.money import round_money
from app.core.pagination import PageParams
from app.repositories.coa_repository import CoaRepository
from app.repositories.opening_balance_repository import OpeningBalanceRepository
from app.repositories.bank_account_repository import BankAccountRepository
from app.schemas.request.starting_balance import SetAccountStartingBalanceRequest
from app.schemas.response.coa import (
    BankStartingBalanceItem,
    BankStartingBalancesResponse,
    RetainedEarningsEffect,
    StartingBalanceItem,
    StartingBalancesResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.coa_tree import root_key_of
from app.services.inventory_opening_service import KIND_INVENTORY_ITEM, InventoryOpeningService
from app.services.invoice_opening_service import InvoiceOpeningService
from app.services.opening_balance_rules import can_have_opening_balance, opening_side
from app.services.posting import OPENING_BALANCE, POSTED, SOURCE_OPENING, DocumentHeader, LineInput, PostingService

AREA = "settings.starting_balances"
KIND_ACCOUNT = "account"
KIND_BANK_ACCOUNT = "bank_account"
INVOICE_KINDS = {"sales_invoice", "purchase_invoice"}
CASH_CONTROL = "cash_control"
ENTITY = "StartingBalance"
RETAINED_EARNINGS = "retained_earnings"
ZERO = Decimal(0)


def opening_date(books_start: date) -> date:
    return books_start - timedelta(days=1)


class OpeningBalanceService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.posting = PostingService(session)
        self.openings = OpeningBalanceRepository(session)
        self.coa = CoaRepository(session)
        self.banks = BankAccountRepository(session)
        self.audit = AuditService(session)

    # ---------------------------------------------------------------- reads
    async def _eligible_accounts(self, business_id: str) -> list[tuple]:
        """(account row, root_key, group name) of every account that takes a starting balance."""
        groups = await self.coa.all_groups(business_id)
        names = {g.id: g.name for g in groups}
        found = []
        for row in await self.openings.balance_sheet_accounts(business_id):
            root_key = root_key_of(groups, row.group_id)
            if can_have_opening_balance(root_key, row.system_account_code, row.subledger_kind):
                found.append((row, root_key, names[row.group_id]))
        return found

    @staticmethod
    def _item(row, root_key: str, group_name: str, live, dp: int) -> StartingBalanceItem:
        side = opening_side(live.debit, live.credit, dp) if live else {"side": None, "amount": round_money(ZERO, dp)}
        return StartingBalanceItem(
            account_id=row.id, account_code=row.code, account_name=row.name, root_key=root_key,
            group_name=group_name, document_id=live.document_id if live else None, **side,
        )

    async def list_accounts(self, business_id: str, params: PageParams) -> StartingBalancesResponse:
        eligible = await self._eligible_accounts(business_id)
        live = await self.openings.live_account_openings(business_id)
        page = eligible[params.offset:params.offset + params.page_size]
        dp = await self.posting.decimals(business_id)
        return StartingBalancesResponse.build(
            [self._item(row, root, group, live.get(row.id), dp) for row, root, group in page],
            len(eligible), params.page, params.page_size, **await self._period(business_id, dp),
        )

    async def _period(self, business_id: str, dp: int) -> dict:
        """Books start, opening date and the Retained earnings side of every live opening line."""
        live = [*(await self.openings.live_account_openings(business_id)).values(),
                *(await self.openings.live_bank_openings(business_id)).values()]
        net = sum((x.debit - x.credit for x in live), ZERO)
        start = await self.posting.books_start_date(business_id)
        return {
            "books_start_date": start, "opening_date": opening_date(start),
            # Retained earnings takes the other side of every opening line.
            "retained_earnings_effect": RetainedEarningsEffect(
                side=None if net == 0 else ("credit" if net > 0 else "debit"), amount=round_money(abs(net), dp)),
        }

    @staticmethod
    def _bank_item(bank, live, dp: int) -> BankStartingBalanceItem:
        side = opening_side(live.debit, live.credit, dp) if live else {"side": None, "amount": round_money(ZERO, dp)}
        return BankStartingBalanceItem(bank_account_id=bank.id, bank_account_name=bank.name,
                                       document_id=live.document_id if live else None, **side)

    async def list_bank_accounts(self, business_id: str, params: PageParams) -> BankStartingBalancesResponse:
        banks, total = await self.banks.list_page(business_id, params.offset, params.page_size)
        live = await self.openings.live_bank_openings(business_id)
        dp = await self.posting.decimals(business_id)
        return BankStartingBalancesResponse.build(
            [self._bank_item(b, live.get(b.id), dp) for b in banks], total, params.page, params.page_size,
            **await self._period(business_id, dp),
        )

    # ---------------------------------------------------------------- writes
    async def set_account(
        self, ctx: BusinessContext, account_id: str, body: SetAccountStartingBalanceRequest
    ) -> StartingBalanceItem:
        if await self.coa.get_account(ctx.business_id, account_id) is None:
            raise ResourceNotFoundError("CoaAccount", account_id)
        match = next((e for e in await self._eligible_accounts(ctx.business_id) if e[0].id == account_id), None)
        if match is None:
            raise LedgerValidationError(
                "Only balance-sheet accounts without a sub-ledger take a starting balance here",
                "opening_balance_not_allowed",
            )
        dp = await self.posting.decimals(ctx.business_id)

        async def item() -> StartingBalanceItem:
            return self._item(*match, (await self.openings.live_account_openings(ctx.business_id)).get(account_id), dp)

        return await self._set(ctx, KIND_ACCOUNT, account_id, body, item,
                               lambda d, c: LineInput(account_id, d, c), account_id=account_id)

    async def set_bank_account(
        self, ctx: BusinessContext, bank_account_id: str, body: SetAccountStartingBalanceRequest
    ) -> BankStartingBalanceItem:
        """T67: the bank or cash account's own two-line opening entry (D-35)."""
        bank = await self.banks.get(ctx.business_id, bank_account_id)
        if bank is None:
            raise ResourceNotFoundError("BankAccount", bank_account_id)
        cash = await self.coa.system_account_id(ctx.business_id, CASH_CONTROL)
        dp = await self.posting.decimals(ctx.business_id)

        async def item() -> BankStartingBalanceItem:
            return self._bank_item(bank, (await self.openings.live_bank_openings(ctx.business_id)).get(bank.id), dp)

        return await self._set(ctx, KIND_BANK_ACCOUNT, bank_account_id, body, item,
                               lambda d, c: LineInput(cash, d, c, bank_account_id=bank.id),
                               bank_account_id=bank.id)

    async def _set(self, ctx: BusinessContext, kind_key: str, record_id: str,
                   body: SetAccountStartingBalanceRequest, item, record_line, **source: str):
        """Set-to-value: void the record's live opening (if any) and post the new one; 0 removes it."""
        dp = await self.posting.decimals(ctx.business_id)
        amount = round_money(body.amount, dp)
        debit, credit = (amount, ZERO) if body.side == "debit" else (ZERO, amount)
        before = await item()
        live = before.document_id is not None
        if (live and before.amount == amount and before.side == body.side) or (not live and amount == 0):
            return before
        if live:
            await self._void(ctx, before.document_id)
        if amount > 0:
            start = await self.posting.books_start_date(ctx.business_id)
            await self._post(ctx, kind_key, opening_date(start), [record_line(debit, credit)], **source)
        after = await item()
        await self.audit.record(ctx.user_id, "set", ENTITY, record_id, ctx.business_id, before=before, after=after)
        return after

    async def redate_all(self, ctx: BusinessContext, new_start: date) -> int:
        """Moving books_start_date: void + re-post every live opening document at the new date."""
        if await self.openings.ordinary_documents_before(ctx.business_id, new_start):
            raise LedgerValidationError(
                "Documents are dated before the new books start date", "documents_before_books_start"
            )
        live = [r for r in await self.openings.live_documents(ctx.business_id)
                if r.kind_key not in INVOICE_KINDS | {KIND_INVENTORY_ITEM}]
        plug = await self.coa.system_account_id(ctx.business_id, RETAINED_EARNINGS)
        await InvoiceOpeningService(self.session).redate(ctx, new_start)
        await InventoryOpeningService(self.session).redate(ctx, new_start)
        for row in live:
            document = await self._void(ctx, row.document_id)
            lines = [x for x in await self.posting.document_lines(document) if x.account_id != plug]
            await self._post(ctx, row.kind_key, opening_date(new_start),
                             [LineInput(x.account_id, x.debit, x.credit, x.description, x.bank_account_id)
                              for x in lines],
                             account_id=row.account_id, bank_account_id=row.bank_account_id)
        return len(live)

    async def _void(self, ctx: BusinessContext, document_id: str):
        document = await self.posting.get_document(ctx.business_id, document_id, OPENING_BALANCE, for_update=True)
        await self.posting.void(ctx, document)
        return document

    async def _post(self, ctx: BusinessContext, kind_key: str, on: date, record_lines: list[LineInput],
                    account_id: str | None = None, bank_account_id: str | None = None) -> None:
        """The record's lines plus one Retained earnings line for the difference (PR-59)."""
        plug = await self.coa.system_account_id(ctx.business_id, RETAINED_EARNINGS)
        debit = sum((x.debit for x in record_lines), ZERO)
        credit = sum((x.credit for x in record_lines), ZERO)
        offset = LineInput(plug, max(credit - debit, ZERO), max(debit - credit, ZERO))
        document = await self.posting.create_document(
            ctx, OPENING_BALANCE, AREA, DocumentHeader(on, None, None), [*record_lines, offset], POSTED,
        )
        await self.posting.post(ctx, document, SOURCE_OPENING)
        await self.posting.link_opening_balance(ctx, document, kind_key, account_id, bank_account_id)
