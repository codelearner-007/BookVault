"""Business user management and platform roles (B0.3; D-29, D-30, D-31 replaced, D-34; AC-08, AC-12, AC-39).

The Next.js routes write auth.users; FastAPI owns every decision they ask for:
email-check (owner + generic refusal), members (creator's own users only),
managed-users/{id}/actions (creator-only account actions, audited, rate-limited).
"""

import ast
import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.config import settings
from tests.support.factories import EMAIL_DOMAIN, add_member, create_business, make_token

APP_DIR = Path(__file__).resolve().parents[2] / "app"
REFUSED = "This email can't be used, choose another"
ACTIONS = ["create", "edit", "reset_password", "disable", "enable", "delete"]


async def _owner_and_member(client, users, role="admin", mode="custom"):
    owner = await users.create(role)
    business_id = (await create_business(client, owner))["id"]
    member = await users.create_member(owner, business_id)
    await add_member(client, owner, business_id, member, mode)
    return owner, business_id, member


async def _email_check(client, user, business_id, email):
    return await client.post(f"/api/v1/businesses/{business_id}/users/email-check",
                             json={"email": email}, headers=user.headers)


async def _action(client, user, target_id, action="reset_password", **extra):
    return await client.post(f"/api/v1/managed-users/{target_id}/actions",
                             json={"action": action, **extra}, headers=user.headers)


async def _role_id(db_conn, name):
    return (await db_conn.execute(text("SELECT id::text FROM roles WHERE name = :n"), {"n": name})).scalar_one()


async def _live_role(db_conn, user_id):
    return (await db_conn.execute(text(
        "SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = CAST(:u AS uuid)"
        " ORDER BY r.hierarchy_level DESC LIMIT 1"), {"u": user_id})).scalar_one_or_none()


def _without_request_id(body: dict) -> dict:
    """Error bodies carry a per-request id; the rest must be identical."""
    return {k: v for k, v in body.items() if k != "request_id"}


async def _audit_rows(db_conn, actor_id, action):
    rows = await db_conn.execute(text(
        "SELECT details FROM audit_logs WHERE user_id = CAST(:u AS uuid) AND action = :a"
    ), {"u": actor_id, "a": action})
    return [r if isinstance(r, dict) else json.loads(r) for r in rows.scalars().all()]


async def _set_bootstrap(db_conn, email):
    await db_conn.execute(text(
        "UPDATE platform_settings SET text_value = :e WHERE key = 'bootstrap_super_admin_email'"
    ), {"e": email})


async def _signup(db_conn, email, confirmed=False, app_metadata=None):
    user_id = str(uuid.uuid4())
    await db_conn.execute(text(
        "INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,"
        " raw_app_meta_data, raw_user_meta_data, created_at, updated_at)"
        " VALUES (:id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', :email, '',"
        " CASE WHEN :confirmed THEN now() END, CAST(:meta AS jsonb), '{}', now(), now())"
    ), {"id": user_id, "email": email, "confirmed": confirmed, "meta": json.dumps(app_metadata or {})})
    return user_id


async def _confirm(db_conn, user_id):
    await db_conn.execute(text(
        "UPDATE auth.users SET email_confirmed_at = now() WHERE id = CAST(:u AS uuid)"), {"u": user_id})


@pytest.fixture
async def no_super_admin(db_conn):
    await db_conn.execute(text(
        "DELETE FROM user_roles WHERE role_id = (SELECT id FROM roles WHERE name = 'super_admin')"))


# ------------------------------------------------------------------ creation: refused emails


async def test_create_user_with_existing_email_refused_generic(client, users, db_conn):
    owner, business_id, member = await _owner_and_member(client, users)
    other_owner, _, other_member = await _owner_and_member(client, users)
    before = (await db_conn.execute(text("SELECT count(*) FROM business_members"))).scalar()

    responses = [await _email_check(client, owner, business_id, email.upper())
                 for email in (other_owner.email, other_member.email, member.email)]
    fresh = await _email_check(client, owner, business_id, f"new-{uuid.uuid4().hex[:6]}@{EMAIL_DOMAIN}")
    after = (await db_conn.execute(text("SELECT count(*) FROM business_members"))).scalar()

    assert {r.status_code for r in responses} == {422}
    assert {r.json()["error"] for r in responses} == {REFUSED}
    assert fresh.status_code == 204
    assert before == after
    assert await _live_role(db_conn, other_owner.id) == "admin"


async def test_create_user_refused_response_same_for_existing_bootstrap_and_blocked_email(
    client, users, db_conn
):
    owner, business_id, _ = await _owner_and_member(client, users)
    blocked = await users.create()
    await db_conn.execute(text(
        "UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = CAST(:u AS uuid)"
    ), {"u": blocked.id})
    await _set_bootstrap(db_conn, "boss@bookvault-test.dev")

    bodies = [_without_request_id((await _email_check(client, owner, business_id, email)).json())
              for email in (owner.email, "Boss@BookVault-test.dev", blocked.email)]

    assert bodies[0] == bodies[1] == bodies[2]
    assert bodies[0]["error"] == REFUSED


async def test_create_user_with_bootstrap_email_refused_generic(client, users, db_conn):
    owner, business_id, _ = await _owner_and_member(client, users)
    await _set_bootstrap(db_conn, "boss@bookvault-test.dev")

    response = await _email_check(client, owner, business_id, " BOSS@bookvault-test.dev")

    assert response.status_code == 422 and response.json()["error"] == REFUSED


async def test_create_user_refusals_rate_limited_and_audited(client, users, db_conn, monkeypatch):
    monkeypatch.setattr(settings, "USER_CREATE_REFUSAL_RATE_LIMIT", "2/hour")
    owner, business_id, _ = await _owner_and_member(client, users)

    codes = [(await _email_check(client, owner, business_id, owner.email)).status_code for _ in range(3)]
    audited = await _audit_rows(db_conn, owner.id, "user_create_refused")

    assert codes == [422, 422, 429]
    assert len(audited) == 3
    assert all("email_sha256" in d and owner.email not in json.dumps(d) for d in audited)


async def test_user_creation_rate_limited(client, users, monkeypatch):
    owner, business_id, _ = await _owner_and_member(client, users)
    monkeypatch.setattr(settings, "USER_MANAGEMENT_RATE_LIMIT", "3/minute")

    codes = [(await _email_check(client, owner, business_id, f"n{i}@{EMAIL_DOMAIN}")).status_code
             for i in range(4)]

    assert codes == [204, 204, 204, 429]


async def test_edit_member_email_to_existing_or_bootstrap_email_refused(client, users, db_conn):
    owner, _, member = await _owner_and_member(client, users)
    await _set_bootstrap(db_conn, "boss@bookvault-test.dev")
    other = await users.create()

    existing = await _action(client, owner, member.id, "edit", email=other.email)
    bootstrap = await _action(client, owner, member.id, "edit", email="boss@bookvault-test.dev")
    same = await _action(client, owner, member.id, "edit", email=member.email)

    assert _without_request_id(existing.json()) == _without_request_id(bootstrap.json())
    assert existing.json()["error"] == REFUSED
    assert same.status_code == 200
    assert len(await _audit_rows(db_conn, owner.id, "user_email_change_refused")) == 2


async def test_edit_member_name_updates_profile(client, users, db_conn):
    owner, _, member = await _owner_and_member(client, users)

    response = await _action(client, owner, member.id, "edit", full_name="Ann Example")
    name = await db_conn.execute(text(
        "SELECT full_name FROM user_profiles WHERE user_id = CAST(:u AS uuid)"), {"u": member.id})

    assert response.status_code == 200
    assert name.scalar() == "Ann Example"


# ------------------------------------------------------------------ created accounts


async def test_created_user_is_member_with_confirmed_email(client, users, db_conn):
    _, _, member = await _owner_and_member(client, users)

    confirmed = await db_conn.execute(text(
        "SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id = CAST(:u AS uuid)"), {"u": member.id})

    assert await _live_role(db_conn, member.id) == "member"
    assert confirmed.scalar() is True


async def test_created_user_is_provisioned_and_flag_immutable(client, users, db_conn):
    owner, _, member = await _owner_and_member(client, users)
    profile = (await db_conn.execute(text(
        "SELECT is_provisioned, created_by_user_id::text FROM user_profiles WHERE user_id = CAST(:u AS uuid)"
    ), {"u": member.id})).one()

    for statement in ("UPDATE user_profiles SET is_provisioned = false WHERE user_id = CAST(:u AS uuid)",
                      "UPDATE user_profiles SET created_by_user_id = user_id WHERE user_id = CAST(:u AS uuid)"):
        async with db_conn.begin_nested() as savepoint:
            with pytest.raises(DBAPIError):
                await db_conn.execute(text(statement), {"u": member.id})
            await savepoint.rollback()

    assert tuple(profile) == (True, owner.id)


async def test_provisioning_requires_the_business_owner_as_creator(client, users, db_conn):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    stranger = await users.create()

    async with db_conn.begin_nested() as savepoint:
        with pytest.raises(DBAPIError):
            await _signup(db_conn, f"x{uuid.uuid4().hex[:6]}@{EMAIL_DOMAIN}", True,
                          {"provisioned_for_business": business_id, "created_by_user_id": stranger.id})
        await savepoint.rollback()


async def test_create_user_cannot_set_role_or_app_metadata(client, users):
    owner, business_id, _ = await _owner_and_member(client, users)
    member = await users.create_member(owner, business_id)
    second = (await create_business(client, owner, "Second"))["id"]

    escalations = [
        {"user_id": member.id, "role": "admin"},
        {"user_id": member.id, "app_metadata": {"user_role": "super_admin"}},
        {"user_id": member.id, "access_mode": "owner"},
    ]
    codes = [(await client.post(f"/api/v1/businesses/{second}/members", json=body,
                                headers=owner.headers)).status_code for body in escalations]
    check = await client.post(f"/api/v1/businesses/{business_id}/users/email-check",
                              json={"email": f"z@{EMAIL_DOMAIN}", "role": "admin"}, headers=owner.headers)

    assert codes == [422, 422, 422]
    assert check.status_code == 422


async def test_full_access_member_cannot_create_users(client, users):
    owner, business_id, member = await _owner_and_member(client, users, mode="full")

    response = await _email_check(client, member, business_id, f"n@{EMAIL_DOMAIN}")

    assert response.status_code == 403


async def test_must_change_password_enforced_until_changed(client, users):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    forced = await users.create_member(owner, business_id, must_change_password=True)
    await add_member(client, owner, business_id, forced, "full")

    blocked = await client.get("/api/v1/businesses", headers=forced.headers)
    me = await client.get("/api/v1/auth/me", headers=forced.headers)
    changed = {"Authorization": f"Bearer {make_token(users.secret, forced.id, forced.email, 'member')}"}
    allowed = await client.get("/api/v1/businesses", headers=changed)

    assert blocked.status_code == 403 and blocked.json()["details"]["code"] == "password_change_required"
    assert me.status_code == 200
    assert allowed.status_code == 200


# ------------------------------------------------------------------ creator-only account actions (AC-39)


@pytest.mark.parametrize("action", ACTIONS)
async def test_user_management_actions_audited(client, users, db_conn, action):
    owner, _, member = await _owner_and_member(client, users)

    response = await _action(client, owner, member.id, action)

    assert response.status_code == 200
    assert len(await _audit_rows(db_conn, owner.id, f"user_{action}")) == 1


async def test_admin_cannot_create_user_in_foreign_business(client, users):
    _, victim_business, _ = await _owner_and_member(client, users)
    attacker = await users.create()

    response = await _email_check(client, attacker, victim_business, f"n@{EMAIL_DOMAIN}")

    assert response.status_code == 404


async def test_super_admin_cannot_create_user_in_business_they_do_not_own(client, users):
    _, victim_business, _ = await _owner_and_member(client, users)
    super_admin = await users.create("super_admin")

    response = await _email_check(client, super_admin, victim_business, f"n@{EMAIL_DOMAIN}")

    assert response.status_code == 404


async def test_super_admin_manages_users_of_own_business(client, users):
    super_admin, _, member = await _owner_and_member(client, users, role="super_admin")

    response = await _action(client, super_admin, member.id, "reset_password")

    assert response.status_code == 200


@pytest.mark.parametrize("action", ["edit", "reset_password"])
async def test_super_admin_cannot_reset_password_or_edit_user_of_other_tenant(client, users, action):
    _, _, member = await _owner_and_member(client, users)
    super_admin = await users.create("super_admin")

    response = await _action(client, super_admin, member.id, action)

    assert response.status_code == 404


async def test_super_admin_over_other_accounts_only_suspend_role_change_and_audit_read(
    client, users, db_conn
):
    owner, business_id, member = await _owner_and_member(client, users)
    super_admin = await users.create("super_admin")

    summary = await client.get(f"/api/v1/users/{owner.id}/access-summary", headers=super_admin.headers)
    audit = await client.get("/api/v1/audit/logs", headers=super_admin.headers)
    account_actions = [(await _action(client, super_admin, uid, a)).status_code
                       for uid in (owner.id, member.id) for a in ACTIONS]
    tenant_data = await client.get(f"/api/v1/businesses/{business_id}/receipts", headers=super_admin.headers)
    members = await client.get(f"/api/v1/businesses/{business_id}/members", headers=super_admin.headers)

    assert summary.status_code == 200 and audit.status_code == 200
    assert set(account_actions) == {404}
    assert (tenant_data.status_code, members.status_code) == (404, 404)


async def test_admin_cannot_reset_password_of_user_in_other_tenant_business(client, users):
    _, _, member = await _owner_and_member(client, users)
    attacker, _, _ = await _owner_and_member(client, users)

    assert (await _action(client, attacker, member.id)).status_code == 404


async def test_admin_cannot_reset_password_of_admin_or_super_admin(client, users):
    attacker = await users.create()
    targets = [await users.create(), await users.create("super_admin"), attacker]

    codes = [(await _action(client, attacker, t.id)).status_code for t in targets]

    assert codes == [404, 404, 404]


async def test_admin_cannot_reset_password_of_user_not_created_by_them(client, users):
    owner, business_id, member = await _owner_and_member(client, users)
    full_member = await users.create_member(owner, business_id)
    await add_member(client, owner, business_id, full_member, "full")

    response = await _action(client, full_member, member.id)

    assert response.status_code == 404


@pytest.mark.parametrize("action", ["disable", "enable", "delete"])
async def test_admin_cannot_disable_or_delete_foreign_user(client, users, action):
    _, _, member = await _owner_and_member(client, users)
    attacker = await users.create()

    assert (await _action(client, attacker, member.id, action)).status_code == 404


async def test_cross_tenant_user_takeover_refused(client, users):
    """An admin cannot reach another tenant's member: not by email, not by id, not by adding."""
    _, _, victim_member = await _owner_and_member(client, users)
    attacker, attacker_business, _ = await _owner_and_member(client, users)

    by_email = await _email_check(client, attacker, attacker_business, victim_member.email)
    by_add = await client.post(f"/api/v1/businesses/{attacker_business}/members",
                               json={"user_id": victim_member.id}, headers=attacker.headers)
    by_actions = [(await _action(client, attacker, victim_member.id, a)).status_code for a in ACTIONS]
    listed = await client.get("/api/v1/managed-users", headers=attacker.headers)

    assert by_email.json()["error"] == REFUSED
    assert by_add.status_code == 404
    assert set(by_actions) == {404}
    assert victim_member.id not in {u["user_id"] for u in listed.json()["items"]}


# ------------------------------------------------------------------ platform roles (AC-08)


async def test_super_admin_changes_platform_role_audited(client, users, db_conn):
    admin = await users.create()
    super_admin = await users.create("super_admin")

    response = await client.post(f"/api/v1/users/{admin.id}/roles",
                                 json={"role_id": await _role_id(db_conn, "member")},
                                 headers=super_admin.headers)
    rows = await _audit_rows(db_conn, super_admin.id, "user_role_assigned")

    assert response.status_code == 201
    assert rows[0]["old_role"] == "admin" and rows[0]["target_user_id"] == admin.id


async def test_demote_owner_with_businesses_409(client, users, db_conn):
    owner = await users.create()
    await create_business(client, owner)
    super_admin = await users.create("super_admin")

    response = await client.delete(f"/api/v1/users/{owner.id}/roles/{await _role_id(db_conn, 'admin')}",
                                   headers=super_admin.headers)

    assert response.status_code == 409
    assert await _live_role(db_conn, owner.id) == "admin"


async def test_super_admin_converts_member_to_admin_audited(client, users, db_conn):
    owner, _, member = await _owner_and_member(client, users)
    super_admin = await users.create("super_admin")

    response = await client.post(f"/api/v1/users/{member.id}/roles",
                                 json={"role_id": await _role_id(db_conn, "admin")},
                                 headers=super_admin.headers)
    rows = await _audit_rows(db_conn, super_admin.id, "user_role_assigned")
    provisioned = await db_conn.execute(text(
        "SELECT is_provisioned FROM user_profiles WHERE user_id = CAST(:u AS uuid)"), {"u": member.id})

    assert response.status_code == 201
    assert (rows[0]["old_role"], rows[0]["new_role"]) == ("member", "admin")
    assert (await _action(client, owner, member.id)).status_code == 404
    assert provisioned.scalar() is True


async def test_platform_role_change_never_sets_or_removes_super_admin(client, users, db_conn):
    super_admin = await users.create("super_admin")
    other_super = await users.create("super_admin")
    admin = await users.create()
    sa_role = await _role_id(db_conn, "super_admin")

    grant = await client.post(f"/api/v1/users/{admin.id}/roles", json={"role_id": sa_role},
                              headers=super_admin.headers)
    revoke = await client.delete(f"/api/v1/users/{other_super.id}/roles/{sa_role}",
                                 headers=super_admin.headers)

    assert (grant.status_code, revoke.status_code) == (403, 403)
    assert await _live_role(db_conn, admin.id) == "admin"


# ------------------------------------------------------------------ signup and the JWT hook


async def test_jwt_hook_without_role_fails_closed(client, users, db_conn):
    user = await users.create()
    await db_conn.execute(text("DELETE FROM user_roles WHERE user_id = CAST(:u AS uuid)"), {"u": user.id})

    event = await db_conn.execute(text(
        "SELECT public.custom_access_token_hook(jsonb_build_object('user_id', CAST(:u AS text),"
        " 'claims', jsonb_build_object('sub', CAST(:u AS text))))"), {"u": user.id})
    created = await client.post("/api/v1/businesses", json={"name": "X"}, headers=user.headers)

    claims = event.scalar()["claims"]
    assert "user_role" not in claims
    assert created.status_code == 403


async def test_first_signup_with_other_email_is_admin(db_conn, no_super_admin):
    await _set_bootstrap(db_conn, "boss@bookvault-test.dev")

    user_id = await _signup(db_conn, f"first@{EMAIL_DOMAIN}")
    await _confirm(db_conn, user_id)

    assert await _live_role(db_conn, user_id) == "admin"


async def test_bootstrap_email_signup_is_super_admin(db_conn, no_super_admin):
    await _set_bootstrap(db_conn, "boss@bookvault-test.dev")

    user_id = await _signup(db_conn, "Boss@BookVault-test.dev")
    at_insert = await _live_role(db_conn, user_id)
    await _confirm(db_conn, user_id)

    assert (at_insert, await _live_role(db_conn, user_id)) == ("admin", "super_admin")


async def test_bootstrap_unconfirmed_signup_stays_admin(db_conn, no_super_admin):
    await _set_bootstrap(db_conn, "boss@bookvault-test.dev")

    user_id = await _signup(db_conn, "boss@bookvault-test.dev")

    assert await _live_role(db_conn, user_id) == "admin"


async def test_bootstrap_email_after_super_admin_exists_is_admin(users, db_conn):
    await users.create("super_admin")
    await _set_bootstrap(db_conn, "boss@bookvault-test.dev")

    user_id = await _signup(db_conn, "boss@bookvault-test.dev")
    await _confirm(db_conn, user_id)

    assert await _live_role(db_conn, user_id) == "admin"


async def test_bootstrap_unset_nobody_becomes_super_admin(db_conn, no_super_admin):
    await _set_bootstrap(db_conn, None)

    user_id = await _signup(db_conn, "boss@bookvault-test.dev")
    await _confirm(db_conn, user_id)

    assert await _live_role(db_conn, user_id) == "admin"


async def test_provisioned_account_with_bootstrap_email_never_super_admin(client, users, db_conn, no_super_admin):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    await _set_bootstrap(db_conn, "boss@bookvault-test.dev")

    user_id = await _signup(db_conn, "boss@bookvault-test.dev", False,
                            {"provisioned_for_business": business_id, "created_by_user_id": owner.id})
    await _confirm(db_conn, user_id)

    assert await _live_role(db_conn, user_id) == "member"


# ------------------------------------------------------------------ single decision point


def test_can_create_business_is_single_decision_point():
    """Only entitlements.py names the creator roles; only the dependency calls the decision."""
    callers, role_sets = [], []
    for path in APP_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id in {"can_create_business", "BUSINESS_CREATOR_ROLES"}:
                callers.append(path.name)
            if isinstance(node, (ast.Set, ast.Tuple, ast.List)):
                values = {getattr(e, "value", None) for e in node.elts}
                if {"admin", "super_admin"} <= values and "member" not in values:
                    role_sets.append(path.name)

    assert set(callers) == {"entitlements.py", "dependencies.py"}
    assert set(role_sets) <= {"entitlements.py"}
