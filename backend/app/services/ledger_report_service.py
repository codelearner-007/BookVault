"""Trial Balance and General Ledger Transactions, read from the stored ledger (B1)."""

from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.exceptions import PermissionDeniedError, ResourceNotFoundError, ValidationError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.repositories.ledger_query_repository import LedgerQueryRepository
from app.schemas.response.journal_entry import (
    GeneralLedgerTransaction,
    GeneralLedgerTransactionsResponse,
    JournalPostingResponse,
    LedgerLineResponse,
    TransactionJournalResponse,
    TrialBalanceResponse,
    TrialBalanceRow,
)
from app.services.access_service import AccessService, BusinessContext
from app.services.posting import PostingService, totals

REPORTS_AREA = "reports"


class LedgerReportService:
    def __init__(self, session: AsyncSession) -> None:
        self.queries = LedgerQueryRepository(session)
        self.access = AccessService(session)
        self.posting = PostingService(session)

    @staticmethod
    def _money(dp: int, row, *names: str) -> dict:
        """Row as a dict with its amounts at the base currency's decimal places (dp read once per request)."""
        return {**row._mapping, **{n: round_money(getattr(row, n), dp) for n in names}}

    async def _assert_can_view_document(self, ctx: BusinessContext, area_key: str) -> None:
        """View on the document's own area, or on reports (journal rows, platform-model §5.2)."""
        try:
            await self.access.resolve(ctx.business_id, ctx.user_id, area_key, AreaRight.VIEW, aal=ctx.aal)
        except PermissionDeniedError:
            await self.access.resolve(ctx.business_id, ctx.user_id, REPORTS_AREA, AreaRight.VIEW, aal=ctx.aal)

    async def trial_balance(self, business_id: str, as_at: date) -> TrialBalanceResponse:
        """Net balance per account as at the date, on its debit or credit side."""
        rows = []
        dp = await self.posting.decimals(business_id)
        for r in await self.queries.trial_balance(business_id, as_at):
            net: Decimal = self._money(dp, r, "net")["net"]
            rows.append(TrialBalanceRow(
                account_id=r.account_id, account_code=r.account_code, account_name=r.account_name,
                account_type=r.account_type, debit=max(net, Decimal(0)), credit=max(-net, Decimal(0)),
            ))
        return TrialBalanceResponse(
            as_at=as_at,
            rows=rows,
            total_debit=sum((r.debit for r in rows), Decimal(0)),
            total_credit=sum((r.credit for r in rows), Decimal(0)),
        )

    async def general_ledger_transactions(
        self, business_id: str, date_from: date, date_to: date, account_id: str | None,
        include_reversed: bool, params: PageParams,
    ) -> GeneralLedgerTransactionsResponse:
        if date_from > date_to:
            raise ValidationError("The start date must be on or before the end date", "from")
        rows, total = await self.queries.general_ledger_page(
            business_id, date_from, date_to, account_id, include_reversed, params.offset, params.page_size
        )
        dp = await self.posting.decimals(business_id)
        items = [GeneralLedgerTransaction.model_validate(self._money(dp, r, "debit", "credit")) for r in rows]
        return GeneralLedgerTransactionsResponse.build(items, total, params.page, params.page_size)

    async def journal(self, ctx: BusinessContext, document_id: str) -> TransactionJournalResponse:
        """Transaction Journal of a document: every entry it posted, reversals included."""
        area_key = await self.queries.document_area(ctx.business_id, document_id) if is_uuid(document_id) else None
        if area_key is None:
            raise ResourceNotFoundError("Document", document_id)
        await self._assert_can_view_document(ctx, area_key)
        entries, lines = await self.queries.document_entries(ctx.business_id, document_id)
        by_entry: dict[str, list[LedgerLineResponse]] = {}
        dp = await self.posting.decimals(ctx.business_id)
        for line in lines:
            by_entry.setdefault(str(line.journal_entry_id), []).append(
                LedgerLineResponse.model_validate(self._money(dp, line, "debit", "credit"))
            )
        postings = []
        for entry in entries:
            entry_lines = by_entry.get(str(entry.id), [])
            debit, credit = totals(entry_lines)
            postings.append(JournalPostingResponse(
                **entry._mapping, lines=entry_lines, total_debit=debit, total_credit=credit,
            ))
        return TransactionJournalResponse(document_id=document_id, entries=postings)
