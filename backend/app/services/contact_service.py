"""Contact service: customers and suppliers (same rules, different table and area)."""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError
from app.core.pagination import PageParams
from app.models.customer import Customer
from app.models.supplier import Supplier
from app.repositories.contact_repository import ContactModel, ContactRepository
from app.schemas.common import PaginatedResponse
from app.schemas.request.contact import ContactCreate, ContactUpdate
from app.schemas.response.contact import ContactResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.versioning import apply_versioned_update, check_version


@dataclass(frozen=True)
class ContactKind:
    key: str  # receipts.paid_by_contact_type value
    area_key: str  # also the URL segment
    label: str
    model: ContactModel


CUSTOMERS = ContactKind("customer", "customers", "Customer", Customer)
SUPPLIERS = ContactKind("supplier", "suppliers", "Supplier", Supplier)
CONTACT_KINDS = {k.key: k for k in (CUSTOMERS, SUPPLIERS)}


class ContactService:
    def __init__(self, session: AsyncSession, kind: ContactKind) -> None:
        self.kind = kind
        self.repo = ContactRepository(session, kind.model)
        self.audit = AuditService(session)

    async def _get_or_404(self, business_id: str, contact_id: str):
        contact = await self.repo.get(business_id, contact_id)
        if contact is None:
            raise ResourceNotFoundError(self.kind.label, contact_id)
        return contact

    async def list_page(
        self, business_id: str, search: str | None, params: PageParams
    ) -> PaginatedResponse[ContactResponse]:
        rows, total = await self.repo.list_page(business_id, search, params.offset, params.page_size)
        items = [ContactResponse.model_validate(r) for r in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def get(self, business_id: str, contact_id: str) -> ContactResponse:
        return ContactResponse.model_validate(await self._get_or_404(business_id, contact_id))

    async def create(self, ctx: BusinessContext, body: ContactCreate) -> ContactResponse:
        contact = self.kind.model(business_id=ctx.business_id, **body.model_dump())
        await self.repo.add(contact)
        after = ContactResponse.model_validate(contact)
        await self.audit.record(ctx.user_id, "create", self.kind.label, contact.id,
                                ctx.business_id, after=after)
        return after

    async def update(self, ctx: BusinessContext, contact_id: str, body: ContactUpdate) -> ContactResponse:
        contact = await self._get_or_404(ctx.business_id, contact_id)
        before = ContactResponse.model_validate(contact)
        apply_versioned_update(contact, body, required=("name",))
        await self.repo.save(contact)
        after = ContactResponse.model_validate(contact)
        await self.audit.record(ctx.user_id, "update", self.kind.label, contact.id,
                                ctx.business_id, before=before, after=after)
        return after

    async def delete(self, ctx: BusinessContext, contact_id: str, version: int) -> None:
        contact = await self._get_or_404(ctx.business_id, contact_id)
        check_version(contact, version)
        before = ContactResponse.model_validate(contact)
        await self.repo.delete(contact)
        await self.audit.record(ctx.user_id, "delete", self.kind.label, contact_id,
                                ctx.business_id, before=before)
