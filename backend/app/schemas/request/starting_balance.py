"""Starting balance request schemas (B2: balance-sheet accounts)."""

from decimal import Decimal
from typing import Literal

from app.schemas.common import NonNegativeMoney, RequestModel


class SetAccountStartingBalanceRequest(RequestModel):
    """Amount 0 removes the account's starting balance."""

    side: Literal["debit", "credit"]
    amount: NonNegativeMoney = Decimal(0)
