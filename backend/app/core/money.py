"""Money arithmetic: Decimal only, rounded half away from zero to the currency's minor unit."""

from decimal import ROUND_HALF_UP, Decimal

# Currencies (with their minor units) arrive in B1; until then every business uses 2.
DEFAULT_CURRENCY_DECIMALS = 2
STORAGE_DECIMALS = 4  # numeric(19,4)


def round_money(value: Decimal, decimals: int = DEFAULT_CURRENCY_DECIMALS) -> Decimal:
    """ROUND_HALF_UP on Decimal rounds ties away from zero (2.345 -> 2.35, -2.345 -> -2.35)."""
    return value.quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP)


def to_storage(value: Decimal) -> str:
    """Decimal string as stored in jsonb money fields (never a float)."""
    return format(value.quantize(Decimal(1).scaleb(-STORAGE_DECIMALS), rounding=ROUND_HALF_UP), "f")
