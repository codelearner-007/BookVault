"""scripts.seed_demo_business: dry run writes nothing; a real run builds a consistent demo business once."""

import pytest
from sqlalchemy import text

from scripts import demo_data
from scripts.seed_demo_business import main

pytestmark = pytest.mark.committed


async def _business_names(committed, owner_id: str) -> list[str]:
    rows = await committed.conn.execute(
        text("SELECT name FROM public.businesses WHERE owner_id = CAST(:id AS uuid)"), {"id": owner_id})
    return [r[0] for r in rows]


async def test_dry_run_then_seed_then_refuse(committed, capsys):
    owner = await committed.create("super_admin")
    args = ["--owner-email", owner.email]

    assert await main(args) == 0
    assert await _business_names(committed, owner.id) == []

    assert await main([*args, "--yes"]) == 0
    out = capsys.readouterr().out
    assert out.count("[OK]") == 5 and "[FAIL]" not in out, out
    assert ": 0.00 vs 0.00" not in out, out  # every figure checked is a real, non-empty balance
    assert await _business_names(committed, owner.id) == [demo_data.BUSINESS_NAME]

    assert await main([*args, "--yes"]) == 2
    assert await _business_names(committed, owner.id) == [demo_data.BUSINESS_NAME]
