"""Inter-account transfer request schemas (B3, PR-10; one currency until B8)."""

import datetime as dt
from typing import Optional

from pydantic import model_validator

from app.schemas.common import IdStr, NonNegativeMoney, OptionalCode, OptionalText, RequestModel, VersionedRequest


class TransferFields(RequestModel):
    date: dt.date
    reference: OptionalCode = None
    description: OptionalText = None
    from_bank_account_id: IdStr
    to_bank_account_id: IdStr
    amount: NonNegativeMoney
    from_clears_later: bool = False
    from_cleared_on: Optional[dt.date] = None
    to_clears_later: bool = False
    to_cleared_on: Optional[dt.date] = None

    @model_validator(mode="after")
    def _consistent(self) -> "TransferFields":
        if (self.from_cleared_on and not self.from_clears_later) or (self.to_cleared_on and not self.to_clears_later):
            raise ValueError("A clear date needs 'cleared on a later date'")
        return self


class CreateTransferRequest(TransferFields):
    post: bool = False


class UpdateTransferRequest(VersionedRequest, TransferFields):
    pass
