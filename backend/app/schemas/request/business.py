"""Business request schemas."""

from app.schemas.common import OptionalName, OptionalText, RequestModel, ShortText, VersionedRequest


class CreateBusinessRequest(RequestModel):
    name: ShortText
    country: OptionalName = None


class UpdateBusinessRequest(VersionedRequest):
    """Full update of the business core fields and address."""

    name: ShortText
    country: OptionalName = None
    address: OptionalText = None
