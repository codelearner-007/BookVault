"""Baseline: own profile read/update (feature #6)."""


async def test_profile_read_and_update(client, users):
    user = await users.create()

    before = await client.get("/api/v1/profile", headers=user.headers)
    updated = await client.patch(
        "/api/v1/profile", json={"full_name": "Ada Lovelace"}, headers=user.headers
    )

    assert before.status_code == 200, before.text
    assert before.json()["user_id"] == user.id
    assert updated.json()["full_name"] == "Ada Lovelace"


async def test_profile_requires_auth(client):
    assert (await client.get("/api/v1/profile")).status_code == 401
