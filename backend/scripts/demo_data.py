"""Static content of the demo business (scripts.seed_demo_business): names, prices, dates.

Amounts are PKR. Everything here is fictional: no real company or person is named.
"""

from __future__ import annotations

BUSINESS_NAME = "Al-Noor Textiles (Demo)"
COUNTRY_CODE = "PK"
COUNTRY_NAME = "Pakistan"
BOOKS_START = "2026-01-01"

# Tabs whose features are built (B0-B7); every other catalog tab is switched off.
BUILT_TABS = frozenset({
    "summary", "bank-and-cash-accounts", "receipts", "payments", "inter-account-transfers",
    "customers", "sales-quotes", "sales-orders", "sales-invoices", "credit-notes", "late-payment-fees",
    "delivery-notes", "withholding-tax-receipts", "suppliers", "purchase-quotes", "purchase-orders",
    "purchase-invoices", "debit-notes", "goods-receipts", "inventory-items", "inventory-transfers",
    "inventory-write-offs", "production-orders", "capital-accounts", "journal-entries", "reports", "settings",
})

# (name, type): added only when the PK template does not already have an account of that name.
EXTRA_ACCOUNTS = (
    ("Rent", "expense"), ("Utilities", "expense"), ("Salaries", "expense"), ("Freight-in", "expense"),
    ("Depreciation", "expense"), ("Bank charges", "expense"), ("Service income", "income"),
    ("Accrued expenses", "liability"), ("Further tax payable", "liability"),
    ("Furniture and equipment", "asset"), ("Accumulated depreciation", "asset"),
)

# key -> tax code body; "account" names an account above (resolved to its id).
TAX_CODES = {
    "gst": {"name": "GST 18%", "code": "GST18", "rate": "18"},
    "gst_further": {"name": "GST 18% + Further tax 4%", "code": "GSTFT", "components": [
        {"name": "Sales tax", "rate": "18"}, {"name": "Further tax", "rate": "4", "account": "Further tax payable"}]},
    "rc": {"name": "Sindh services tax 15% (reverse charge)", "code": "RC15", "rate": "15", "is_reverse_charge": True},
}

# key -> (name, code, opening balance, can_have_pending)
BANK_ACCOUNTS = {
    "hbl": ("HBL Current Account", "HBL-01", "2450000", True),
    "meezan": ("Meezan Business Account", "MZN-01", "1200000", False),
    "cash": ("Cash in Hand", "CASH", "150000", False),
}

# key -> (name, code, email, address with phone)
CUSTOMERS = {
    "zainab": ("Zainab Fabrics", "C-001", "orders@zainabfabrics.example",
               "Shop 14, Azam Cloth Market, Lahore\nPhone: +92 42 3765 1120"),
    "rehmat": ("Rehmat Garments", "C-002", "accounts@rehmatgarments.example",
               "Plot 22, Sector 7-A, Korangi Industrial Area, Karachi\nPhone: +92 21 3505 4471"),
    "bilal": ("Bilal Cloth House", "C-003", "bilal@clothhouse.example",
              "Kotwali Road, Faisalabad\nPhone: +92 41 2614 908"),
    "noor": ("Noor Bridal Boutique", "C-004", "hello@noorbridal.example",
             "F-7 Markaz, Islamabad\nPhone: +92 51 2650 3345"),
    "shahzad": ("Shahzad Traders", "C-005", "shahzad.traders@example.com",
                "Hussain Agahi Bazaar, Multan\nPhone: +92 61 4512 776"),
    "hamza": ("Hamza Home Linen", "C-006", "purchase@hamzalinen.example",
              "Paris Road, Sialkot\nPhone: +92 52 3256 189"),
}

SUPPLIERS = {
    "gulshan": ("Gulshan Spinning Mills", "S-001", "sales@gulshanspinning.example",
                "Sheikhupura Road, Faisalabad\nPhone: +92 41 4380 221"),
    "kohinoor": ("Kohinoor Dyeing & Finishing", "S-002", "billing@kohinoordyeing.example",
                 "Sundar Industrial Estate, Lahore\nPhone: +92 42 3529 7781"),
    "faisal": ("Faisal Packaging Industries", "S-003", "info@faisalpack.example",
               "SITE Area, Karachi\nPhone: +92 21 3256 0094"),
    "sitara": ("Sitara Textile Chemicals", "S-004", "orders@sitarachem.example",
               "Jhang Road, Faisalabad\nPhone: +92 41 8723 450"),
    "madina": ("Al-Madina Goods Transport", "S-005", "dispatch@madinagoods.example",
               "Truck Stand, Band Road, Lahore\nPhone: +92 300 845 2210"),
}

# key -> (code, name, unit, purchase price, sales price)
INVENTORY_ITEMS = {
    "cy30": ("CY30", "Cotton Yarn 30s", "kg", "720", "850"),
    "py150": ("PY150", "Polyester Yarn 150D", "kg", "540", "640"),
    "gf60": ("GF60", "Grey Fabric 60 inch", "meter", "260", "320"),
    "dl01": ("DL01", "Dyed Lawn Fabric", "meter", "420", "560"),
    "ts01": ("TS01", "Sewing Thread Spool", "spool", "95", "140"),
    "bs01": ("BS01", "Bedsheet Set King", "set", None, "4800"),
    "tw01": ("TW01", "Cotton Bath Towel", "piece", "380", "520"),
    "pc01": ("PC01", "Packing Carton 5-ply", "piece", "85", None),
}

# key -> (code, name, sales price); income goes to Service income.
SERVICE_ITEMS = {
    "dyeing": ("SV-DYE", "Fabric Dyeing Service", "180"),
    "design": ("SV-DSN", "Design & Sampling Charges", "15000"),
}

SECOND_LOCATION = ("Lahore Warehouse", "LHR")

MONTHLY_RENT = "120000"
MONTHLY_SALARIES = "380000"
MONTHLY_UTILITIES = "85000"
MONTHLY_DEPRECIATION = "45000"
MONTH_ENDS = ("2026-08-31", "2026-09-30", "2026-10-31")
