"""History of one ledger document, Restore this version and Restore a deleted document.

A document's history is its audit rows (before / after snapshots of the API response). Restoring a version
replays that snapshot through the document type's own update (posted documents: reversal + repost inside
the type's service, so the ledger stays append-only and every rule still applies). Restoring a deleted
(voided) document reopens it as a draft and, when it had been posted, posts it again.
"""

import types
import typing
from dataclasses import dataclass
from typing import Any, Callable

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ResourceNotFoundError
from app.core.pagination import PageParams
from app.models.ledger import Document
from app.repositories.audit_repository import AuditFilter, AuditRepository
from app.schemas.common import PaginatedResponse
from app.schemas.response.audit import AuditLogResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting.service import DRAFT, POSTED, VOID, PostingService
from app.services.versioning import check_version

RESTORE = "restore"
DELETE_ACTIONS = ("void",)


@dataclass(frozen=True)
class DocumentHandler:
    """How one document type is changed: its service (built per session) and its update request body."""

    service: Callable[[AsyncSession], Any]
    update_body: type[BaseModel]


def _model_of(annotation) -> type[BaseModel] | None:
    """The pydantic model inside an annotation (Model, list[Model], Model | None), if any."""
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return annotation
    for arg in typing.get_args(annotation):
        found = _model_of(arg)
        if found is not None:
            return found
    return None


def _is_list(annotation) -> bool:
    origin = typing.get_origin(annotation)
    if origin in (list, tuple):
        return True
    if origin in (typing.Union, types.UnionType):
        return any(_is_list(arg) for arg in typing.get_args(annotation))
    return False


def project(model: type[BaseModel], data: dict) -> dict:
    """Keep only the fields `model` accepts from a response snapshot (recursively for nested lines)."""
    body = {}
    for name, field in model.model_fields.items():
        if name not in data:
            continue
        value, nested = data[name], _model_of(field.annotation)
        if nested is not None and _is_list(field.annotation) and isinstance(value, list):
            value = [project(nested, item) if isinstance(item, dict) else item for item in value]
        elif nested is not None and isinstance(value, dict):
            value = project(nested, value)
        body[name] = value
    return body


class DocumentHistoryService:
    def __init__(self, session: AsyncSession, handlers: dict[str, DocumentHandler]) -> None:
        self.session = session
        self.handlers = handlers
        self.audit_rows = AuditRepository(session)
        self.audit = AuditService(session)
        self.posting = PostingService(session)

    async def document(self, business_id: str, document_id: str) -> tuple[Document, str]:
        """The document and its type key; 404 outside the business or for a type without history."""
        document = await self.posting.find_document(business_id, document_id)
        type_key = document and await self.posting.type_key_of(document)
        if document is None or type_key not in self.handlers:
            raise ResourceNotFoundError("Document", document_id)
        return document, type_key

    async def history(self, business_id: str, document_id: str, params: PageParams) -> PaginatedResponse[AuditLogResponse]:
        return await self.audit.list_page(AuditFilter(business_id=business_id, entity_id=document_id), params)

    async def restore_version(self, ctx: BusinessContext, document: Document, type_key: str,
                              audit_id: str, version: int):
        """Bring the document back to the state an audit entry recorded (its after, or before for a delete)."""
        entry = await self.audit_rows.get_for_entity(ctx.business_id, document.id, audit_id)
        if entry is None:
            raise ResourceNotFoundError("History entry", audit_id)
        snapshot = entry.before if entry.action in DELETE_ACTIONS else (entry.after or entry.before)
        if not snapshot:
            raise ConflictError("This history entry has no version to restore", "nothing_to_restore")
        if await self.posting.status_of(document) == VOID:
            raise ConflictError("Restore the deleted document first", "document_deleted")
        handler = self.handlers[type_key]
        body = handler.update_body.model_validate({**project(handler.update_body, snapshot), "version": version})
        result = await handler.service(self.session).update(ctx, document.id, body)
        await self.audit.record(ctx.user_id, RESTORE, entry.entity_type, document.id, ctx.business_id,
                                after=result, details={"restored_from": audit_id})
        return result

    async def restore_deleted(self, ctx: BusinessContext, document: Document, type_key: str, version: int):
        """Reopen a deleted document; one that was posted is posted again (a new entry, same date)."""
        if await self.posting.status_of(document) != VOID:
            raise ConflictError("Only a deleted document can be restored", "document_not_deleted")
        check_version(document, version)
        deleted = await self.audit_rows.latest_for_entity(ctx.business_id, document.id, "void")
        was_posted = bool(deleted and (deleted.before or {}).get("status") == POSTED)
        await self.posting.reopen(ctx, document)
        await self.session.flush()
        service = self.handlers[type_key].service(self.session)
        result = await service.post(ctx, document.id, document.version) if was_posted \
            else await service.get(ctx.business_id, document.id)
        await self.audit.record(ctx.user_id, RESTORE, deleted.entity_type if deleted else type_key, document.id,
                                ctx.business_id, after=result, details={"restored": "deleted", "status": DRAFT})
        return result
