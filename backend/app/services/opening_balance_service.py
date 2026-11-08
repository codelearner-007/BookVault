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
from app.schemas.request.starting_balance import SetAccountStartingBalanceRequest
from app.schemas.response.coa import RetainedEarningsEffect, StartingBalanceItem, StartingBalancesResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.coa_tree import root_key_of
from app.services.opening_balance_rules import can_have_opening_balance, opening_side
from app.services.posting import OPENING_BALANCE, POSTED, SOURCE_OPENING, DocumentHeader, LineInput, PostingService

AREA = "settings.starting_balances"
KIND_ACCOUNT = "account"
ENTITY = "StartingBalance"
RETAINED_EARNINGS = "retained_earnings"
ZERO = Decimal(0)


def opening_date(books_start: date) -> date:
    return books_start - timedelta(days=1)


class OpeningBalanceService:
    def __init__(self, session: AsyncSession) -> None:
        self.posting = PostingService(session)
        self.openings = OpeningBalanceRepository(session)
        self.coa = CoaRepository(session)
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
        net = sum((x.debit - x.credit for x in live.values()), ZERO)
        page = eligible[params.offset:params.offset + params.page_size]
        start = await self.posting.books_start_date(business_id)
        dp = await self.posting.decimals(business_id)
        return StartingBalancesResponse.build(
            [self._item(row, root, group, live.get(row.id), dp) for row, root, group in page],
            len(eligible), params.page, params.page_size,
            books_start_date=start, opening_date=opening_date(start),
            # Retained earnings takes the other side of every opening line.
            retained_earnings_effect=RetainedEarningsEffect(
                side=None if net == 0 else ("credit" if net > 0 else "debit"), amount=round_money(abs(net), dp)),
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
        amount = round_money(body.amount, dp)
        debit, credit = (amount, ZERO) if body.side == "debit" else (ZERO, amount)
        live = (await self.openings.live_account_openings(ctx.business_id)).get(account_id)
        if (live and (live.debit, live.credit) == (debit, credit)) or (live is None and amount == 0):
            return self._item(*match, live, dp)
        before = self._item(*match, live, dp)
        if live:
            await self._void(ctx, live.document_id)
        if amount > 0:
            start = await self.posting.books_start_date(ctx.business_id)
            await self._post(ctx, KIND_ACCOUNT, account_id, opening_date(start),
                             [LineInput(account_id, debit, credit)])
        after = self._item(*match, (await self.openings.live_account_openings(ctx.business_id)).get(account_id), dp)
        await self.audit.record(ctx.user_id, "set", ENTITY, account_id, ctx.business_id, before=before, after=after)
        return after

    async def redate_all(self, ctx: BusinessContext, new_start: date) -> int:
        """Moving books_start_date: void + re-post every live opening document at the new date."""
        if await self.openings.ordinary_documents_before(ctx.business_id, new_start):
            raise LedgerValidationError(
                "Documents are dated before the new books start date", "documents_before_books_start"
            )
        live = await self.openings.live_documents(ctx.business_id)
        for row in live:
            document = await self._void(ctx, row.document_id)
            lines = [x for x in await self.posting.document_lines(document) if x.account_id == row.account_id]
            await self._post(ctx, row.kind_key, row.account_id, opening_date(new_start),
                             [LineInput(x.account_id, x.debit, x.credit, x.description) for x in lines])
        return len(live)

    async def _void(self, ctx: BusinessContext, document_id: str):
        document = await self.posting.get_document(ctx.business_id, document_id, OPENING_BALANCE, for_update=True)
        await self.posting.void(ctx, document)
        return document

    async def _post(self, ctx: BusinessContext, kind_key: str, account_id: str, on: date,
                    record_lines: list[LineInput]) -> None:
        """The record's lines plus one Retained earnings line for the difference (PR-59)."""
        plug = await self.coa.system_account_id(ctx.business_id, RETAINED_EARNINGS)
        debit = sum((x.debit for x in record_lines), ZERO)
        credit = sum((x.credit for x in record_lines), ZERO)
        offset = LineInput(plug, max(credit - debit, ZERO), max(debit - credit, ZERO))
        document = await self.posting.create_document(
            ctx, OPENING_BALANCE, AREA, DocumentHeader(on, None, None), [*record_lines, offset], POSTED,
        )
        await self.posting.post(ctx, document, SOURCE_OPENING)
        await self.posting.link_opening_balance(ctx, document, kind_key, account_id)
