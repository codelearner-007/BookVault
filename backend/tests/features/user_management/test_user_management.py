"""Baseline: platform user list pagination and stats, super admin only (feature #4)."""


async def test_user_list_pagination(client, users):
    super_admin = await users.create("super_admin")
    for _ in range(3):
        await users.create()

    page = await client.get(
        "/api/v1/users/with-roles?page=1&page_size=2", headers=super_admin.headers
    )

    body = page.json()
    assert page.status_code == 200, page.text
    assert len(body["items"]) == 2
    assert body["total"] >= 4


async def test_user_stats(client, users):
    super_admin = await users.create("super_admin")

    response = await client.get("/api/v1/users/stats", headers=super_admin.headers)

    assert response.status_code == 200, response.text
    assert response.json()["total_users"] >= 1
