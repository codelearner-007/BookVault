"""Suspense balance endpoints."""

from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access

router = APIRouter(
    prefix="/businesses/{business_id}/suspense",
    tags=["Suspense"],
)



class SuspenseBalanceResponse(BaseModel):
    business_id: str
    suspense_balance: float


class SuspenseEntryResponse(BaseModel):
    receipt_id: str
    receipt_date: date
    receipt_reference: str | None
    paid_by_other: str | None
    paid_by_contact_id: str | None
    paid_by_contact_type: str | None
    amount: float
    line_index: int


class SuspenseEntriesResponse(BaseModel):
    items: list[SuspenseEntryResponse]
    total: int


@router.get("/balance", response_model=SuspenseBalanceResponse, dependencies=[Depends(require_business_access("suspense", AreaRight.VIEW))])
async def get_suspense_balance(
    business_id: str,
    db: AsyncSession = Depends(get_db),
) -> SuspenseBalanceResponse:
    result = await db.execute(
        text(
            "SELECT suspense_balance"
            " FROM private.business_suspense_balance"
            " WHERE business_id = :business_id"
        ),
        {"business_id": business_id},
    )
    row = result.mappings().one_or_none()
    balance = float(row["suspense_balance"]) if row else 0.0
    return SuspenseBalanceResponse(business_id=business_id, suspense_balance=balance)


@router.get("/entries", response_model=SuspenseEntriesResponse, dependencies=[Depends(require_business_access("suspense", AreaRight.VIEW))])
async def get_suspense_entries(
    business_id: str,
    db: AsyncSession = Depends(get_db),
) -> SuspenseEntriesResponse:
    result = await db.execute(
        text(
            "SELECT"
            "    r.id AS receipt_id,"
            "    r.date AS receipt_date,"
            "    r.reference AS receipt_reference,"
            "    r.paid_by_other,"
            "    r.paid_by_contact_id,"
            "    r.paid_by_contact_type,"
            "    (line->>'amount')::numeric AS amount,"
            "    (line_entry).ordinality - 1 AS line_index"
            " FROM public.receipts r,"
            "      jsonb_array_elements(r.lines) WITH ORDINALITY AS line_entry(line, ordinality)"
            " WHERE r.business_id = :business_id"
            "   AND line->>'account_id' = 'suspense'"
            " ORDER BY r.date DESC, r.created_at DESC"
        ),
        {"business_id": business_id},
    )
    rows = result.mappings().all()
    items = [
        SuspenseEntryResponse(
            receipt_id=str(row["receipt_id"]),
            receipt_date=row["receipt_date"],
            receipt_reference=row["receipt_reference"],
            paid_by_other=row["paid_by_other"],
            paid_by_contact_id=row["paid_by_contact_id"],
            paid_by_contact_type=row["paid_by_contact_type"],
            amount=float(row["amount"]),
            line_index=int(row["line_index"]),
        )
        for row in rows
    ]
    return SuspenseEntriesResponse(items=items, total=len(items))
