"""Withholding tax requests (B7): receipts (certificates, PR-36) and the settings (BUG-01, D-27)."""

import datetime as dt
from typing import Literal, Optional

from app.schemas.common import IdStr, OptionalCode, OptionalText, RequestModel, VersionedRequest
from app.schemas.request.sales import PositiveMoney


class WithholdingTaxReceiptFields(RequestModel):
    date: dt.date
    reference: OptionalCode = None
    customer_id: IdStr
    amount: PositiveMoney
    description: OptionalText = None


class CreateWithholdingTaxReceiptRequest(WithholdingTaxReceiptFields):
    post: bool = False


class UpdateWithholdingTaxReceiptRequest(VersionedRequest, WithholdingTaxReceiptFields):
    pass


class UpdateWithholdingTaxSettingsRequest(VersionedRequest):
    """The flags only show the form fields; a setting never removes a ledger line (BUG-01)."""

    wht_receivable_enabled: Optional[bool] = None
    wht_payable_enabled: Optional[bool] = None
    wht_base: Optional[Literal["gross", "net"]] = None
