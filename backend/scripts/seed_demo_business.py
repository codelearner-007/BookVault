"""Create one realistic demo business for an existing account, through the API and its services.

  python -m scripts.seed_demo_business --owner-email you@example.com            # dry run
  python -m scripts.seed_demo_business --owner-email you@example.com --yes      # create it

Every write is an in-process HTTP request to the FastAPI app as the owner (routes -> services ->
posting service), on a session that runs as bookvault_api with app.user_id = the owner, so
validation, posting rules, triggers, audit rows and RLS all apply. No ledger row is written by SQL.
The only SQL here is the read-only lookup of the owner's account by email.

It creates one new business and never touches another: it refuses when the owner already has a
business with that name. At the end it prints a consistency summary (trial balance, AR, AP,
inventory) and exits non-zero when a check fails.

Environment:
  DATABASE_URL               the app's connection (as for the API; from backend/.env)
  SEED_ADMIN_DATABASE_URL    connection that can read auth.users (default: DATABASE_URL)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from decimal import Decimal

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from scripts import demo_data as data

API_ROLE = "bookvault_api"
CLIENT_HEADERS = {"X-BookVault-Client": "web"}
TB_AS_AT = "2100-12-31"
PAGE_SIZE = 100

_OWNER = text("""
    SELECT CAST(u.id AS text) AS id, u.email, r.name AS role, r.hierarchy_level
    FROM auth.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE lower(u.email) = lower(:email)
""")


class SeedError(RuntimeError):
    """An API call answered with an unexpected status."""


@dataclass(frozen=True)
class Owner:
    id: str
    email: str
    role: str
    hierarchy_level: int

    def claims(self) -> dict:
        return {"user_id": self.id, "email": self.email, "user_role": self.role,
                "hierarchy_level": self.hierarchy_level, "aal": "aal2", "auth_methods": {},
                "must_change_password": False}


async def find_owner(email: str) -> Owner | None:
    from app.core.config import settings

    url = os.environ.get("SEED_ADMIN_DATABASE_URL") or settings.DATABASE_URL
    engine = create_async_engine(url.replace("postgresql://", "postgresql+asyncpg://"))
    try:
        async with engine.connect() as conn:
            row = (await conn.execute(_OWNER, {"email": email})).mappings().first()
    finally:
        await engine.dispose()
    return Owner(row["id"], row["email"], row["role"], row["hierarchy_level"]) if row else None


class Api:
    """JSON calls to the app; any status other than the expected one raises SeedError."""

    def __init__(self, http: httpx.AsyncClient) -> None:
        self.http = http
        self.base = "/api/v1"

    def scoped(self, business_id: str) -> "Api":
        api = Api(self.http)
        api.base = f"/api/v1/businesses/{business_id}"
        return api

    async def call(self, method: str, path: str, body: dict | None = None, expect: int = 200,
                   params: dict | None = None) -> dict:
        headers = {"Idempotency-Key": str(uuid.uuid4())} if method == "POST" else {}
        response = await self.http.request(method, self.base + path, json=body, params=params, headers=headers)
        if response.status_code != expect:
            raise SeedError(f"{method} {path} -> {response.status_code}: {response.text}")
        return response.json() if response.content else {}

    async def get(self, path: str, **params) -> dict:
        return await self.call("GET", path, params=params or None)

    async def post(self, path: str, body: dict, expect: int = 201) -> dict:
        return await self.call("POST", path, body, expect)

    async def put(self, path: str, body: dict) -> dict:
        return await self.call("PUT", path, body)


@asynccontextmanager
async def owner_client(owner: Owner) -> AsyncGenerator[Api, None]:
    """The app in-process, authenticated as the owner, every session as the API role (RLS)."""
    from app.core.dependencies import enforce_rate_limit, get_db, get_verified_claims
    from app.db.session import DB_ROLE_KEY, get_session_manager
    from app.main import app

    async def _claims() -> dict:
        return owner.claims()

    async def _db() -> AsyncGenerator:
        async with get_session_manager().session(owner.id) as session:
            session.sync_session.info[DB_ROLE_KEY] = API_ROLE
            yield session

    async def _no_rate_limit() -> None:
        """A one-off back-office run, not a client: the per-user request limit does not apply."""

    overrides = {get_verified_claims: _claims, get_db: _db, enforce_rate_limit: _no_rate_limit}
    app.dependency_overrides.update(overrides)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://seed",
                                     headers=CLIENT_HEADERS, timeout=120) as http:
            yield Api(http)
    finally:
        for key in overrides:
            app.dependency_overrides.pop(key, None)


async def owns_business_named(api: Api, owner: Owner, name: str) -> bool:
    listed = await api.get("/businesses", page_size=PAGE_SIZE)
    return any(b["name"] == name and b.get("owner_id", owner.id) == owner.id for b in listed["items"])


def _walk(nodes: list[dict]):
    for node in nodes:
        yield from node["accounts"]
        yield from _walk(node["groups"])


@dataclass
class Ids:
    """Everything the activity steps refer to, by the keys used in demo_data."""

    accounts: dict[str, str] = field(default_factory=dict)  # name -> id
    system: dict[str, str] = field(default_factory=dict)  # system_account_code -> id
    tax: dict[str, str] = field(default_factory=dict)
    banks: dict[str, str] = field(default_factory=dict)
    customers: dict[str, str] = field(default_factory=dict)
    suppliers: dict[str, str] = field(default_factory=dict)
    items: dict[str, str] = field(default_factory=dict)
    locations: dict[str, str] = field(default_factory=dict)
    invoices: dict[str, dict] = field(default_factory=dict)


class Seeder:
    """Builds the demo business step by step; each step is a handful of API calls."""

    def __init__(self, api: Api) -> None:
        self.root = api
        self.api = api
        self.ids = Ids()
        self.business: dict = {}

    # ------------------------------------------------------------------ setup
    async def create_business(self, name: str) -> None:
        countries = await self.root.get("/countries", page_size=PAGE_SIZE, search=data.COUNTRY_NAME)
        country = next(c for c in countries["items"] if c["code"] == data.COUNTRY_CODE)
        self.business = await self.root.post("/businesses", {
            "name": name, "country_id": country["id"], "books_start_date": data.BOOKS_START})
        self.api = self.root.scoped(self.business["id"])
        tabs = await self.api.get("/tabs", page_size=PAGE_SIZE)
        await self.api.put("/tabs", {"items": [{"key": t["key"], "enabled": t["key"] in data.BUILT_TABS}
                                               for t in tabs["items"]]})

    async def load_accounts(self) -> None:
        tree = await self.api.get("/chart-of-accounts/tree", as_at=TB_AS_AT, include_hidden="true")
        for account in _walk(tree["roots"]):
            self.ids.accounts.setdefault(account["name"].lower(), account["id"])
            if account.get("system_account_code"):
                self.ids.system[account["system_account_code"]] = account["id"]

    def account(self, name: str) -> str:
        return self.ids.accounts[name.lower()]

    async def create_accounts(self) -> None:
        await self.load_accounts()
        for name, type_ in data.EXTRA_ACCOUNTS:
            if name.lower() not in self.ids.accounts:
                created = await self.api.post("/chart-of-accounts/accounts", {"name": name, "type": type_})
                self.ids.accounts[name.lower()] = created["id"]

    async def create_tax(self) -> None:
        for key, spec in data.TAX_CODES.items():
            body = {k: v for k, v in spec.items() if k != "components"}
            if "components" in spec:
                body["components"] = [{"name": c["name"], "rate": c["rate"],
                                       **({"account_id": self.account(c["account"])} if "account" in c else {})}
                                      for c in spec["components"]]
            self.ids.tax[key] = (await self.api.post("/tax-codes", body))["id"]
        settings = await self.api.get("/settings/withholding-tax")
        await self.api.put("/settings/withholding-tax", {
            "version": settings["version"], "wht_receivable_enabled": True, "wht_payable_enabled": True,
            "wht_base": "gross"})

    async def create_banks(self) -> None:
        for key, (name, code, opening, pending) in data.BANK_ACCOUNTS.items():
            created = await self.api.post("/bank-accounts", {"name": name, "code": code, "can_have_pending": pending})
            self.ids.banks[key] = created["id"]
            await self.api.put(f"/starting-balances/bank-accounts/{created['id']}",
                               {"side": "debit", "amount": opening})

    async def create_contacts(self) -> None:
        for kind, specs, target in (("customers", data.CUSTOMERS, self.ids.customers),
                                    ("suppliers", data.SUPPLIERS, self.ids.suppliers)):
            for key, (name, code, email, address) in specs.items():
                body = {"name": name, "code": code, "email": email, "billing_address": address,
                        "delivery_address": address}
                if kind == "customers":
                    body["default_due_days"] = 30
                target[key] = (await self.api.post(f"/{kind}", body))["id"]

    async def create_items(self) -> None:
        locations = (await self.api.get("/inventory-locations"))["items"]
        default = next(x for x in locations if x["is_default"])
        second = await self.api.post("/inventory-locations",
                                     {"name": data.SECOND_LOCATION[0], "code": data.SECOND_LOCATION[1]})
        self.ids.locations = {"default": default["id"], "lahore": second["id"]}
        for key, (code, name, unit, buy, sell) in data.INVENTORY_ITEMS.items():
            body = {"name": name, "code": code, "unit_name": unit, "tax_code_id": self.ids.tax["gst"],
                    "purchase_unit_price": buy, "sales_unit_price": sell}
            self.ids.items[key] = (await self.api.post("/inventory-items", body))["id"]
        for key, (code, name, price) in data.SERVICE_ITEMS.items():
            self.ids.items[key] = (await self.api.post("/non-inventory-items", {
                "name": name, "code": code, "sales_unit_price": price,
                "income_account_id": self.account("Service income")}))["id"]
        kit = await self.api.post("/inventory-kits", {
            "name": "Bedsheet Gift Pack", "code": "KIT-BG", "sales_unit_price": "6200",
            "components": [{"item_id": self.ids.items["bs01"], "qty": "1"},
                           {"item_id": self.ids.items["tw01"], "qty": "2"}]})
        self.ids.items["kit"] = kit["id"]

    # ------------------------------------------------------------------ helpers
    def lines(self, *rows: tuple, tax: str | None = "gst") -> list[dict]:
        """rows: (item key, qty, unit price[, description])."""
        return [{"item_id": self.ids.items[r[0]], "qty": r[1], "unit_price": r[2],
                 **({"description": r[3]} if len(r) > 3 else {}),
                 **({"tax_code_id": self.ids.tax[tax]} if tax else {})} for r in rows]

    async def copy_to(self, kind: str, source: dict, target: str, date: str, ref: str, **extra) -> dict:
        prefill = (await self.api.post(f"/{kind}/{source['id']}/copy-to", {"target": target}, 200))["prefill"]
        path = "/" + target.replace("_", "-") + "s"
        return await self.api.post(path, {**prefill, "date": date, "reference": ref, "post": True, **extra})

    async def cash(self, kind: str, date: str, ref: str, bank: str | None, lines: list[dict], **extra) -> dict:
        return await self.api.post(f"/{kind}", {
            "date": date, "reference": ref, "bank_account_id": self.ids.banks[bank] if bank else None,
            "post": True, "lines": lines, **extra})

    def ar(self, customer: str, amount: str, invoice: str | None = None) -> dict:
        return {"account_id": self.ids.system["accounts_receivable"], "party_id": self.ids.customers[customer],
                "unit_price": amount, **({"invoice_id": self.ids.invoices[invoice]["id"]} if invoice else {})}

    def ap(self, supplier: str, amount: str, invoice: str | None = None) -> dict:
        return {"account_id": self.ids.system["accounts_payable"], "party_id": self.ids.suppliers[supplier],
                "unit_price": amount, **({"invoice_id": self.ids.invoices[invoice]["id"]} if invoice else {})}

    def expense(self, name: str, amount: str, description: str) -> dict:
        return {"account_id": self.account(name), "unit_price": amount, "description": description}

    async def journal(self, date: str, ref: str, description: str, debit: str, credit: str, amount: str) -> None:
        await self.api.post("/journal-entries", {"date": date, "reference": ref, "description": description,
                                                 "post": True, "lines": [
            {"account_id": self.account(debit), "debit": amount, "credit": "0"},
            {"account_id": self.account(credit), "debit": "0", "credit": amount}]})

    async def month_end(self, index: int, date: str) -> None:
        """Rent and salaries paid, utilities accrued, depreciation charged."""
        month = date[:7]
        await self.cash("payments", date, f"RENT-{month}", "hbl",
                        [self.expense("Rent", data.MONTHLY_RENT, f"Mill and office rent {month}")],
                        counterparty_name="Chaudhry Estates")
        await self.cash("payments", date, f"SAL-{month}", "meezan",
                        [self.expense("Salaries", data.MONTHLY_SALARIES, f"Staff salaries {month}")],
                        counterparty_name="Payroll")
        await self.journal(date, f"JV-ACR-{index}", f"Electricity and gas accrued for {month}",
                           "Utilities", "Accrued expenses", data.MONTHLY_UTILITIES)
        await self.journal(date, f"JV-DEP-{index}", f"Monthly depreciation, machinery and furniture {month}",
                           "Depreciation", "Accumulated depreciation", data.MONTHLY_DEPRECIATION)

    # ------------------------------------------------------------------ activity
    async def august_purchases(self) -> None:
        quote = await self.api.post("/purchase-quotes", {
            "date": "2026-08-01", "reference": "RFQ-2608-01", "supplier_id": self.ids.suppliers["gulshan"],
            "post": True, "description": "Yarn for the autumn lawn season",
            "lines": self.lines(("cy30", "1000", "720"), ("py150", "500", "540"))})
        order = await self.copy_to("purchase-quotes", quote, "purchase_order", "2026-08-03", "PO-2608-01")
        self.ids.invoices["gulshan1"] = await self.copy_to(
            "purchase-orders", order, "purchase_invoice", "2026-08-06", "GSM/INV/4471", due_date="2026-09-05",
            freight_in=[{"description": "Faisalabad to mill, 2 trucks", "amount": "25000"}])
        await self.copy_to("purchase-orders", order, "goods_receipt", "2026-08-06", "GRN-2608-01")
        self.ids.invoices["kohinoor1"] = await self.api.post("/purchase-invoices", {
            "date": "2026-08-08", "reference": "KDF-1182", "supplier_id": self.ids.suppliers["kohinoor"],
            "due_date": "2026-09-07", "post": True, "acts_as_stock_movement": True,
            "lines": self.lines(("gf60", "2000", "260"), ("dl01", "1500", "420"), ("ts01", "500", "95"),
                                ("tw01", "600", "380"))})
        self.ids.invoices["faisal1"] = await self.api.post("/purchase-invoices", {
            "date": "2026-08-10", "reference": "FPI-0937", "supplier_id": self.ids.suppliers["faisal"],
            "due_date": "2026-08-25", "post": True, "acts_as_stock_movement": True,
            "lines": self.lines(("pc01", "1000", "85"))})
        self.ids.invoices["madina1"] = await self.api.post("/purchase-invoices", {
            "date": "2026-08-12", "reference": "AMT-552", "supplier_id": self.ids.suppliers["madina"],
            "due_date": "2026-09-11", "post": True, "description": "Outward freight, August consignments",
            "lines": [{"account_id": self.account("Freight-in"), "qty": "1", "unit_price": "38000",
                       "description": "Lahore and Karachi deliveries", "tax_code_id": self.ids.tax["rc"]}]})
        await self.api.post("/inventory-transfers", {
            "date": "2026-08-14", "reference": "TRF-2608-01", "post": True, "description": "Stock for Lahore outlet",
            "from_location_id": self.ids.locations["default"], "to_location_id": self.ids.locations["lahore"],
            "lines": [{"item_id": self.ids.items[k], "qty": q} for k, q in (("gf60", "500"), ("tw01", "200"),
                                                                            ("dl01", "300"))]})

    async def august_sales(self) -> None:
        quote = await self.api.post("/sales-quotes", {
            "date": "2026-08-11", "reference": "QT-2608-01", "customer_id": self.ids.customers["zainab"],
            "expiry_date": "2026-08-31", "post": True, "lines": self.lines(("dl01", "500", "560"))})
        order = await self.copy_to("sales-quotes", quote, "sales_order", "2026-08-13", "SO-2608-01")
        self.ids.invoices["zainab1"] = await self.copy_to("sales-orders", order, "sales_invoice", "2026-08-15",
                                                          "INV-2608-001", due_date="2026-09-14")
        await self.copy_to("sales-orders", order, "delivery_note", "2026-08-16", "DN-2608-01")
        self.ids.invoices["rehmat1"] = await self.api.post("/sales-invoices", {
            "date": "2026-08-18", "reference": "INV-2608-002", "customer_id": self.ids.customers["rehmat"],
            "due_date": "2026-09-17", "post": True, "acts_as_stock_movement": True,
            "lines": self.lines(("cy30", "300", "850"), tax="gst_further")})
        self.ids.invoices["bilal1"] = await self.api.post("/sales-invoices", {
            "date": "2026-08-22", "reference": "INV-2608-003", "customer_id": self.ids.customers["bilal"],
            "due_date": "2026-09-21", "post": True, "acts_as_stock_movement": True,
            "withholding_tax": {"type": "percentage", "value": "4"},
            "lines": self.lines(("gf60", "800", "320"), ("dyeing", "800", "180", "Dyeing of the same lot"))})

    async def august_cash(self) -> None:
        await self.cash("receipts", "2026-08-28", "RCV-2608-01", "hbl", [self.ar("zainab", "150000", "zainab1")],
                        description="Part payment, cheque 004512")
        await self.cash("receipts", "2026-08-30", "RCV-2608-02", "meezan",
                        [self.ar("rehmat", self.ids.invoices["rehmat1"]["total"], "rehmat1")],
                        description="Online transfer IBFT")
        await self.cash("payments", "2026-08-20", "PAY-2608-01", "hbl",
                        [self.ap("faisal", self.ids.invoices["faisal1"]["total"], "faisal1")])
        await self.cash("payments", "2026-08-25", "PAY-2608-02", "hbl", [self.ap("gulshan", "600000", "gulshan1")],
                        description="First instalment against GSM/INV/4471")
        await self.cash("payments", "2026-08-27", "PAY-2608-03", "meezan", [self.ap("sitara", "75000")],
                        description="Advance for reactive dyes, October delivery")
        await self.month_end(1, data.MONTH_ENDS[0])

    async def september(self) -> None:
        await self.api.post("/production-orders", {
            "date": "2026-09-03", "reference": "PRD-2609-01", "post": True, "description": "King bedsheet run",
            "finished_item_id": self.ids.items["bs01"], "qty": "100",
            "lines": [{"item_id": self.ids.items["dl01"], "qty": "600"},
                      {"item_id": self.ids.items["ts01"], "qty": "100"}],
            "costs": [{"account_id": self.account("Salaries"), "amount": "40000", "description": "Stitching labour"}]})
        self.ids.invoices["gulshan2"] = await self.api.post("/purchase-invoices", {
            "date": "2026-09-08", "reference": "GSM/INV/4590", "supplier_id": self.ids.suppliers["gulshan"],
            "due_date": "2026-10-08", "post": True, "acts_as_stock_movement": True,
            "lines": self.lines(("cy30", "500", "740"))})
        self.ids.invoices["noor1"] = await self.api.post("/sales-invoices", {
            "date": "2026-09-10", "reference": "INV-2609-004", "customer_id": self.ids.customers["noor"],
            "due_date": "2026-10-10", "post": True, "acts_as_stock_movement": True,
            "lines": self.lines(("kit", "30", "6200"))})
        self.ids.invoices["hamza1"] = await self.api.post("/sales-invoices", {
            "date": "2026-09-12", "reference": "INV-2609-005", "customer_id": self.ids.customers["hamza"],
            "due_date": "2026-10-12", "post": True, "acts_as_stock_movement": True,
            "location_id": self.ids.locations["lahore"], "lines": self.lines(("tw01", "150", "520"))})
        await self.api.post("/credit-notes", {
            "date": "2026-09-15", "reference": "CN-2609-01", "customer_id": self.ids.customers["rehmat"],
            "invoice_id": self.ids.invoices["rehmat1"]["id"], "post": True, "acts_as_stock_movement": True,
            "description": "20 kg returned, uneven twist", "lines": self.lines(("cy30", "20", "850"), tax="gst_further")})
        await self.api.post("/debit-notes", {
            "date": "2026-09-16", "reference": "DBN-2609-01", "supplier_id": self.ids.suppliers["kohinoor"],
            "invoice_id": self.ids.invoices["kohinoor1"]["id"], "post": True, "acts_as_stock_movement": True,
            "description": "50 m grey fabric returned, weaving faults", "lines": self.lines(("gf60", "50", "260"))})
        await self.api.post("/inventory-write-offs", {
            "date": "2026-09-25", "reference": "WO-2609-01", "post": True,
            "description": "Cartons damaged by monsoon leakage", "lines": [{"item_id": self.ids.items["pc01"], "qty": "40"}]})

    async def september_cash(self) -> None:
        bilal = self.ids.invoices["bilal1"]
        await self.cash("receipts", "2026-09-18", "RCV-2609-03", "hbl", [self.ar("bilal", bilal["total"], "bilal1")],
                        description="Net of 4% income tax withheld")
        await self.api.post("/withholding-tax-receipts", {
            "date": "2026-09-20", "reference": "WHT-CERT-0912", "customer_id": self.ids.customers["bilal"],
            "amount": bilal["withholding_tax"]["amount"], "post": True,
            "description": "Withholding certificate u/s 153 for INV-2608-003"})
        await self.cash("receipts", "2026-09-24", "RCV-2609-04", "meezan", [self.ar("noor", "120000", "noor1")])
        await self.cash("receipts", "2026-09-26", "RCV-2609-05", "cash", [self.ar("shahzad", "200000")],
                        description="Advance for October bedsheet order")
        await self.cash("payments", "2026-09-05", "PAY-2609-04", "hbl", [
            self.ap("gulshan", str(Decimal(self.ids.invoices["gulshan1"]["total"]) - 600000), "gulshan1")])
        await self.cash("payments", "2026-09-07", "PAY-2609-05", "meezan", [self.ap("kohinoor", "1000000")],
                        description="Against KDF-1182, balance next month")
        await self.api.post("/inter-account-transfers", {
            "date": "2026-09-01", "reference": "TRF-BNK-01", "description": "Cash for petty expenses",
            "from_bank_account_id": self.ids.banks["hbl"], "to_bank_account_id": self.ids.banks["cash"],
            "amount": "100000", "post": True})
        await self.api.post("/inter-account-transfers", {
            "date": "2026-09-15", "reference": "TRF-BNK-02", "description": "Fund HBL for supplier payments",
            "from_bank_account_id": self.ids.banks["meezan"], "to_bank_account_id": self.ids.banks["hbl"],
            "amount": "500000", "post": True})
        await self.cash("payments", "2026-09-30", "PAY-2609-06", "meezan",
                        [self.expense("Accrued expenses", data.MONTHLY_UTILITIES, "LESCO and SNGPL bills, August")],
                        counterparty_name="LESCO / SNGPL")
        await self.month_end(2, data.MONTH_ENDS[1])

    async def october(self) -> None:
        self.ids.invoices["shahzad1"] = await self.api.post("/sales-invoices", {
            "date": "2026-10-05", "reference": "INV-2610-006", "customer_id": self.ids.customers["shahzad"],
            "due_date": "2026-11-04", "post": True, "acts_as_stock_movement": True,
            "lines": self.lines(("bs01", "25", "4800"), ("design", "1", "15000"))})
        await self.api.post("/sales-orders", {
            "date": "2026-10-09", "reference": "SO-2610-02", "customer_id": self.ids.customers["hamza"], "post": True,
            "lines": self.lines(("tw01", "100", "520"))})
        await self.api.post("/sales-quotes", {
            "date": "2026-10-20", "reference": "QT-2610-03", "customer_id": self.ids.customers["zainab"],
            "expiry_date": "2026-11-30", "post": True, "lines": self.lines(("dl01", "400", "575"))})
        await self.api.post("/purchase-orders", {
            "date": "2026-10-12", "reference": "PO-2610-02", "supplier_id": self.ids.suppliers["kohinoor"],
            "post": True, "lines": self.lines(("gf60", "1000", "265"))})
        await self.cash("receipts", "2026-10-14", "RCV-2610-06", "hbl", [self.ar("zainab", "100000", "zainab1")])
        await self.cash("receipts", "2026-10-18", "RCV-2610-07", None, [self.ar("hamza", "50000", "hamza1")],
                        description="Deposit seen on statement, account to be confirmed")
        await self.cash("payments", "2026-10-06", "PAY-2610-07", "hbl", [
            self.ap("madina", self.ids.invoices["madina1"]["total"], "madina1")])
        await self.cash("payments", "2026-10-08", "PAY-2610-08", "hbl", [self.ap("gulshan", "250000", "gulshan2")])
        await self.cash("payments", "2026-10-15", "PAY-2610-09", "cash", [
            self.expense("Freight-in", "12500", "Loader and rickshaw charges"),
            self.expense("Bank charges", "1850", "Cheque book and IBFT fees")], counterparty_name="Petty cash")
        await self.cash("payments", "2026-10-30", "PAY-2610-10", "meezan",
                        [self.expense("Accrued expenses", data.MONTHLY_UTILITIES, "LESCO and SNGPL bills, September")],
                        counterparty_name="LESCO / SNGPL")
        await self.month_end(3, data.MONTH_ENDS[2])

    async def run(self, name: str) -> None:
        for step in (lambda: self.create_business(name), self.create_accounts, self.load_accounts,
                     self.create_tax, self.create_banks, self.create_contacts, self.create_items,
                     self.august_purchases, self.august_sales, self.august_cash, self.september,
                     self.september_cash, self.october):
            await step()

    # ------------------------------------------------------------------ checks
    async def checks(self) -> list[tuple[str, Decimal, Decimal, bool]]:
        """(label, left, right, ok): TB balances, AR, AP and inventory agree exactly with their sub-ledgers
        (the item average is value / qty rounded for display, so qty x average is not compared)."""
        tb = await self.api.get("/reports/trial-balance", as_at=TB_AS_AT)
        gl = {r["account_id"]: Decimal(r["debit"]) - Decimal(r["credit"]) for r in tb["rows"]}
        customers = (await self.api.get("/customers", page_size=PAGE_SIZE))["items"]
        suppliers = (await self.api.get("/suppliers", page_size=PAGE_SIZE))["items"]
        items = (await self.api.get("/inventory-items", page_size=PAGE_SIZE))["items"]
        item_cost = sum((Decimal(x["total_cost"]) for x in items), Decimal(0))
        rows = [
            ("Trial balance debits = credits", Decimal(tb["total_debit"]), Decimal(tb["total_credit"])),
            ("AR control = sum of customers", gl.get(self.ids.system["accounts_receivable"], Decimal(0)),
             sum((Decimal(x["ar_balance"]) for x in customers), Decimal(0))),
            ("AP control = sum of suppliers", -gl.get(self.ids.system["accounts_payable"], Decimal(0)),
             sum((Decimal(x["ap_balance"]) for x in suppliers), Decimal(0))),
            ("Inventory on hand = sum of item cost", gl.get(self.ids.system["inventory_on_hand"], Decimal(0)),
             item_cost),
        ]
        return [(label, left, right, left == right) for label, left, right in rows]


def print_checks(results: list[tuple[str, Decimal, Decimal, bool]]) -> None:
    for label, left, right, ok in results:
        print(f"  [{'OK' if ok else 'FAIL'}] {label}: {left:,.2f} vs {right:,.2f}")


async def seed(owner: Owner, name: str, apply: bool) -> int:
    async with owner_client(owner) as api:
        if await owns_business_named(api, owner, name):
            print(f"Refusing: {owner.email} already has a business named {name!r}.")
            return 2
        if not apply:
            print(f"Dry run: would create {name!r} for {owner.email} ({owner.role}) with "
                  f"{len(data.CUSTOMERS)} customers, {len(data.SUPPLIERS)} suppliers, "
                  f"{len(data.INVENTORY_ITEMS)} inventory items and Aug-Oct 2026 activity. Re-run with --yes.")
            return 0
        seeder = Seeder(api)
        await seeder.run(name)
        results = await seeder.checks()
    print(f"Created {name!r} (id {seeder.business['id']}) for {owner.email}.")
    print_checks(results)
    return 0 if all(ok for *_, ok in results) else 1


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--owner-email", required=True)
    parser.add_argument("--name", default=data.BUSINESS_NAME)
    parser.add_argument("--yes", action="store_true", help="create it (default: dry run)")
    args = parser.parse_args(argv)
    owner = await find_owner(args.owner_email)
    if owner is None:
        print(f"No account with email {args.owner_email}.")
        return 2
    try:
        return await seed(owner, args.name, args.yes)
    finally:
        from app.db.session import get_session_manager

        await get_session_manager().close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
