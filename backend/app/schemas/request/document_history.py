"""Request bodies of the per-document History routes."""

from app.schemas.common import IdStr, VersionedRequest


class RestoreVersionRequest(VersionedRequest):
    """The history entry to bring back, and the document version the client read."""

    audit_id: IdStr
