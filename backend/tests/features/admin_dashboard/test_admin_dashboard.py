"""Admin dashboard stats: the caller's own numbers, for admin and super admin (CS-21, CS-25)."""

import pytest

from tests.support.factories import create_business

URL = "/api/v1/dashboard/stats"


@pytest.mark.parametrize("role", ["admin", "super_admin"])
async def test_admin_dashboard_stats_200_for_admin_and_super_admin(client, users, role):
    user = await users.create(role)
    await create_business(client, user)

    response = await client.get(URL, headers=user.headers)

    assert response.status_code == 200, response.text
    stats = response.json()
    assert stats["total_businesses"] == 1
    assert stats["total_audit_logs"] >= 1 and stats["recent_activity_24h"] >= 1


async def test_admin_dashboard_stats_only_own_data(client, users):
    me, other = await users.create(), await users.create()
    await create_business(client, other, "Theirs")

    stats = (await client.get(URL, headers=me.headers)).json()

    assert stats == {"total_businesses": 0, "total_audit_logs": 0, "recent_activity_24h": 0}
