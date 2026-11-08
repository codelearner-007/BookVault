"""Business request schemas."""

from datetime import date
from typing import Optional

from app.schemas.common import IdStr, OptionalText, RequestModel, ShortText, VersionedRequest


class CreateBusinessRequest(RequestModel):
    """country_id left out: the user's own country (D-28); null: no country (generic chart).
    books_start_date left out: the creation date."""

    name: ShortText
    country_id: Optional[IdStr] = None
    books_start_date: Optional[date] = None


class UpdateBusinessRequest(VersionedRequest):
    """Full update of the business core fields and address."""

    name: ShortText
    country_id: Optional[IdStr] = None
    address: OptionalText = None


class PurgeBusinessRequest(RequestModel):
    """Permanent delete of a business in Trash (B0.8): typed name + export offered first."""

    confirmation: ShortText
    export_offered: bool
