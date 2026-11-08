"""Tax codes (single rate until B7, D-05) and non-inventory items (PR-25) for the sales forms (B4).

A tax code is one component with a rate and the account its tax posts to (default Tax payable,
PR-18 BV: never a component without an account). A non-inventory item names the income account
it is sold to (no Suspense default). Both are hard-deleted only while nothing references them.
"""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, LedgerValidationError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.pagination import PageParams
from app.models.sales import Item, TaxCode, TaxCodeComponent
from app.repositories.coa_repository import CoaRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.schemas.request.sales import CreateItemRequest, CreateTaxCodeRequest, UpdateItemRequest, UpdateTaxCodeRequest
from app.schemas.response.sales import ItemListResponse, ItemResponse, TaxCodeListResponse, TaxCodeResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.versioning import changed_fields, check_version

TAX_PAYABLE = "tax_payable"
NON_INVENTORY = "non_inventory"
TAX_ACCOUNT_TYPES = {"liability", "asset"}


class MasterDataService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = MasterDataRepository(session)
        self.coa = CoaRepository(session)
        self.audit = AuditService(session)

    async def _assert_account(self, business_id: str, account_id: str | None, types: set[str], label: str) -> None:
        if account_id is None:
            return
        row = (await self.repo.account_types(business_id, {account_id})).get(account_id)
        if row is None or not row.is_active or row.type not in types:
            raise LedgerValidationError(f"Choose an active {label} account of this business", "invalid_account")

    async def _assert_unique(self, model, business_id: str, name: str | None, code: str | None,
                             exclude_id: str | None = None) -> None:
        if name and await self.repo.name_taken(model, business_id, name, exclude_id):
            raise ConflictError("This name is already used", "name_taken")
        if await self.repo.code_taken(model, business_id, code, exclude_id):
            raise ConflictError("This code is already used", "code_taken")

    # ---------------------------------------------------------------- tax codes
    async def list_tax_codes(self, business_id: str, params: PageParams) -> TaxCodeListResponse:
        rows, total = await self.repo.tax_code_page(business_id, params.offset, params.page_size)
        return TaxCodeListResponse.build([TaxCodeResponse.model_validate(r) for r in rows], total,
                                         params.page, params.page_size)

    async def get_tax_code(self, business_id: str, tax_code_id: str) -> TaxCodeResponse:
        row = await self.repo.tax_code_row(business_id, tax_code_id) if is_uuid(tax_code_id) else None
        if row is None:
            raise ResourceNotFoundError("TaxCode", tax_code_id)
        return TaxCodeResponse.model_validate(row)

    async def create_tax_code(self, ctx: BusinessContext, body: CreateTaxCodeRequest) -> TaxCodeResponse:
        account_id = body.account_id or await self.coa.system_account_id(ctx.business_id, TAX_PAYABLE)
        await self._assert_account(ctx.business_id, account_id, TAX_ACCOUNT_TYPES, "liability or asset")
        await self._assert_unique(TaxCode, ctx.business_id, body.name, body.code)
        code = TaxCode(business_id=ctx.business_id, name=body.name, code=body.code)
        await self.repo.add(code)
        await self.repo.add(TaxCodeComponent(business_id=ctx.business_id, tax_code_id=code.id, rate=body.rate,
                                             account_id=account_id))
        after = await self.get_tax_code(ctx.business_id, code.id)
        await self.audit.record(ctx.user_id, "create", "TaxCode", code.id, ctx.business_id, after=after)
        return after

    async def update_tax_code(self, ctx: BusinessContext, tax_code_id: str,
                              body: UpdateTaxCodeRequest) -> TaxCodeResponse:
        before = await self.get_tax_code(ctx.business_id, tax_code_id)
        code = await self.repo.tax_code(ctx.business_id, tax_code_id)
        check_version(code, body.version)
        fields = changed_fields(body, required=("name", "rate", "account_id"))
        await self._assert_account(ctx.business_id, fields.get("account_id"), TAX_ACCOUNT_TYPES, "liability or asset")
        await self._assert_unique(TaxCode, ctx.business_id, fields.get("name"), fields.get("code"), code.id)
        component = await self.repo.tax_component(ctx.business_id, code.id)
        for key in ("rate", "account_id"):
            if key in fields:
                setattr(component, key, fields.pop(key))
        for key, value in fields.items():
            setattr(code, key, value)
        code.updated_at = datetime.now(timezone.utc)  # write the row so its version moves (rate is on the component)
        await self.repo.save()
        after = await self.get_tax_code(ctx.business_id, code.id)
        await self.audit.record(ctx.user_id, "update", "TaxCode", code.id, ctx.business_id, before=before, after=after)
        return after

    async def delete_tax_code(self, ctx: BusinessContext, tax_code_id: str, version: int) -> None:
        before = await self.get_tax_code(ctx.business_id, tax_code_id)
        code = await self.repo.tax_code(ctx.business_id, tax_code_id)
        check_version(code, version)
        if await self.repo.tax_code_in_use(ctx.business_id, code.id):
            raise ConflictError("This tax code is used and cannot be deleted; make it inactive instead",
                                "tax_code_in_use")
        await self.repo.delete(code)
        await self.audit.record(ctx.user_id, "delete", "TaxCode", tax_code_id, ctx.business_id, before=before)

    # ---------------------------------------------------------------- non-inventory items
    async def list_items(self, business_id: str, search: str | None, params: PageParams) -> ItemListResponse:
        rows, total = await self.repo.item_page(business_id, NON_INVENTORY, search, params.offset, params.page_size)
        return ItemListResponse.build([ItemResponse.model_validate(r) for r in rows], total,
                                      params.page, params.page_size)

    async def get_item(self, business_id: str, item_id: str) -> ItemResponse:
        row = await self.repo.item_row(business_id, NON_INVENTORY, item_id) if is_uuid(item_id) else None
        if row is None:
            raise ResourceNotFoundError("Item", item_id)
        return ItemResponse.model_validate(row)

    async def _assert_item_refs(self, business_id: str, fields: dict) -> None:
        await self._assert_account(business_id, fields.get("income_account_id"), {"income"}, "income")
        await self._assert_account(business_id, fields.get("expense_account_id"), {"expense"}, "expense")
        tax_code_id = fields.get("tax_code_id")
        if tax_code_id and await self.repo.tax_code(business_id, tax_code_id) is None:
            raise LedgerValidationError("Tax code not found in this business", "invalid_tax_code")

    async def create_item(self, ctx: BusinessContext, body: CreateItemRequest) -> ItemResponse:
        fields = body.model_dump()
        await self._assert_item_refs(ctx.business_id, fields)
        await self._assert_unique(Item, ctx.business_id, None, body.code)
        item = Item(business_id=ctx.business_id, item_kind_key=NON_INVENTORY, **fields)
        await self.repo.add(item)
        after = await self.get_item(ctx.business_id, item.id)
        await self.audit.record(ctx.user_id, "create", "Item", item.id, ctx.business_id, after=after)
        return after

    async def update_item(self, ctx: BusinessContext, item_id: str, body: UpdateItemRequest) -> ItemResponse:
        before = await self.get_item(ctx.business_id, item_id)
        item = await self.repo.item(ctx.business_id, item_id)
        check_version(item, body.version)
        fields = changed_fields(body, required=("name", "income_account_id"))
        await self._assert_item_refs(ctx.business_id, fields)
        await self._assert_unique(Item, ctx.business_id, None, fields.get("code"), item.id)
        for key, value in fields.items():
            setattr(item, key, value)
        await self.repo.save()
        after = await self.get_item(ctx.business_id, item.id)
        await self.audit.record(ctx.user_id, "update", "Item", item.id, ctx.business_id, before=before, after=after)
        return after

    async def delete_item(self, ctx: BusinessContext, item_id: str, version: int) -> None:
        before = await self.get_item(ctx.business_id, item_id)
        item = await self.repo.item(ctx.business_id, item_id)
        check_version(item, version)
        if await self.repo.item_in_use(ctx.business_id, item.id):
            raise ConflictError("This item is used and cannot be deleted; make it inactive instead", "item_in_use")
        await self.repo.delete(item)
        await self.audit.record(ctx.user_id, "delete", "Item", item_id, ctx.business_id, before=before)
