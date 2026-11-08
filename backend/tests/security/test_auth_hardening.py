"""Auth hardening on the FastAPI side (B0.7; D-23, D-29, L1, H1; AC-30, AC-36, AC-40, AC-41).

GoTrue itself is tested in tests/auth/ (direct calls with the anon key, mode C).
"""

import json
import logging
import time
import uuid

import pytest
from sqlalchemy import text

from app.core.config import settings
from app.services.startup_service import run_startup_checks
from tests.conftest import TEST_JWT_SECRET
from tests.support.factories import EMAIL_DOMAIN, add_member, create_business, make_token

CODES = "/api/v1/auth/mfa/recovery-codes"
RECOVER = "/api/v1/auth/mfa/recover"
EVENTS = "/api/v1/auth/events"
PLATFORM_ROUTE = "/api/v1/users/stats"
BOOTSTRAP = "boss@bookvault-test.dev"


def _headers(user, aal="aal2", signed_in_seconds_ago=0, role=None) -> dict:
    now = int(time.time())
    amr = [{"method": "password", "timestamp": now - signed_in_seconds_ago},
           {"method": "totp", "timestamp": now - signed_in_seconds_ago}]
    token = make_token(TEST_JWT_SECRET, user.id, user.email, role or user.role,
                       extra={"aal": aal, "amr": amr})
    return {"Authorization": f"Bearer {token}"}


async def _enroll_factor(db_conn, user_id: str) -> None:
    await db_conn.execute(text(
        "INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)"
        " VALUES (gen_random_uuid(), CAST(:u AS uuid), :n, 'totp', 'verified', now(), now())"
    ), {"u": user_id, "n": f"app-{uuid.uuid4().hex[:6]}"})


async def _audit_actions(db_conn, user_id: str) -> list[str]:
    rows = await db_conn.execute(text(
        "SELECT action FROM audit_logs WHERE user_id = CAST(:u AS uuid) ORDER BY created_at, id"
    ), {"u": user_id})
    return [r[0] for r in rows.all()]


async def _mfa_user(users, db_conn):
    user = await users.create()
    await _enroll_factor(db_conn, user.id)
    return user


# ------------------------------------------------------------------ recovery codes (D-23, AC-40)


async def test_recovery_code_count_from_config(client, users, db_conn, monkeypatch):
    monkeypatch.setattr(settings, "MFA_RECOVERY_CODE_COUNT", 4)
    user = await _mfa_user(users, db_conn)

    created = await client.post(CODES, headers=_headers(user))
    status = await client.get(CODES, headers=_headers(user))
    stored = await db_conn.execute(text(
        "SELECT code_hash FROM mfa_recovery_codes WHERE user_id = CAST(:u AS uuid)"), {"u": user.id})

    codes = created.json()["codes"]
    assert created.status_code == 201 and len(codes) == 4 and len(set(codes)) == 4
    assert status.json() == {"remaining": 4}
    hashes = {row[0] for row in stored.all()}
    assert len(hashes) == 4 and not any(c in hashes or c.replace("-", "") in hashes for c in codes)
    assert "mfa_recovery_codes_generated" in await _audit_actions(db_conn, user.id)


async def test_recovery_codes_need_enrolled_factor_aal2_and_recent_sign_in(client, users, db_conn):
    plain = await users.create()
    enrolled = await _mfa_user(users, db_conn)

    no_factor = await client.post(CODES, headers=_headers(plain))
    aal1 = await client.post(CODES, headers=_headers(enrolled, aal="aal1"))
    stale = await client.post(CODES, headers=_headers(enrolled, signed_in_seconds_ago=3600))

    assert no_factor.status_code == 409 and no_factor.json()["details"]["code"] == "mfa_not_enrolled"
    assert aal1.status_code == 403 and aal1.json()["details"]["code"] == "mfa_required"
    assert stale.status_code == 403 and stale.json()["details"]["code"] == "reauth_required"


async def test_recovery_code_single_use(client, users, db_conn):
    user = await _mfa_user(users, db_conn)
    code = (await client.post(CODES, headers=_headers(user))).json()["codes"][0]

    first = await client.post(RECOVER, json={"code": code.lower()}, headers=_headers(user, aal="aal1"))
    again = await client.post(RECOVER, json={"code": code}, headers=_headers(user, aal="aal1"))
    left = await db_conn.execute(text(
        "SELECT count(*) FROM mfa_recovery_codes WHERE user_id = CAST(:u AS uuid)"), {"u": user.id})

    assert first.status_code == 204
    assert again.status_code == 400 and again.json()["details"]["code"] == "invalid_recovery_code"
    assert left.scalar_one() == 0  # the factor goes away, so the whole set is dropped
    assert "mfa_recovery_used" in await _audit_actions(db_conn, user.id)


async def test_recovery_code_of_another_user_rejected(client, users, db_conn):
    owner_of_codes = await _mfa_user(users, db_conn)
    attacker = await _mfa_user(users, db_conn)
    code = (await client.post(CODES, headers=_headers(owner_of_codes))).json()["codes"][0]

    response = await client.post(RECOVER, json={"code": code}, headers=_headers(attacker, aal="aal1"))

    assert response.status_code == 400


async def test_recovery_code_attempts_rate_limited(client, users, db_conn, monkeypatch):
    monkeypatch.setattr(settings, "MFA_RECOVERY_ACCOUNT_RATE_LIMIT", "3/hour")
    user = await _mfa_user(users, db_conn)
    other = await _mfa_user(users, db_conn)

    codes = [(await client.post(RECOVER, json={"code": "AAAAA-BBBBB"},
                                headers=_headers(user, aal="aal1"))).status_code for _ in range(4)]
    other_code = (await client.post(RECOVER, json={"code": "AAAAA-BBBBB"},
                                    headers=_headers(other, aal="aal1"))).status_code

    assert codes == [400, 400, 400, 429]
    assert other_code == 400


async def test_recovery_codes_deleted_only_without_verified_factor(client, users, db_conn):
    user = await _mfa_user(users, db_conn)
    await client.post(CODES, headers=_headers(user))

    while_enrolled = await client.delete(CODES, headers=_headers(user))
    await db_conn.execute(text("DELETE FROM auth.mfa_factors WHERE user_id = CAST(:u AS uuid)"), {"u": user.id})
    after_unenroll = await client.delete(CODES, headers=_headers(user))

    assert while_enrolled.status_code == 409
    assert after_unenroll.status_code == 204
    assert (await client.get(CODES, headers=_headers(user))).json() == {"remaining": 0}


async def test_pending_mfa_session_only_reaches_the_recover_route(client, users, db_conn):
    user = await _mfa_user(users, db_conn)

    profile = await client.get("/api/v1/profile", headers=_headers(user, aal="aal1"))
    recover = await client.post(RECOVER, json={"code": "AAAAA-BBBBB"}, headers=_headers(user, aal="aal1"))

    assert profile.status_code == 403
    assert recover.status_code == 400  # reached the route: only the code was wrong


# ------------------------------------------------------------------ client auth events


async def test_auth_events_allow_list_and_enrollment_check(client, users, db_conn):
    user = await users.create()

    revoked = await client.post(EVENTS, json={"event": "sessions_revoked"}, headers=user.headers)
    not_enrolled = await client.post(EVENTS, json={"event": "mfa_enrolled"}, headers=user.headers)
    forged = await client.post(EVENTS, json={"event": "bootstrap_super_admin_promoted"}, headers=user.headers)
    await _enroll_factor(db_conn, user.id)
    enrolled = await client.post(EVENTS, json={"event": "mfa_enrolled"}, headers=_headers(user))

    assert (revoked.status_code, not_enrolled.status_code, forged.status_code, enrolled.status_code) == (
        204, 409, 422, 204)
    assert await _audit_actions(db_conn, user.id) == ["sessions_revoked", "mfa_enrolled"]


# ------------------------------------------------------------------ super admin AAL2 (B0.5 deferral)


async def test_super_admin_platform_route_requires_aal2(client, users, db_conn):
    super_admin = await users.create("super_admin")

    aal1 = await client.get(PLATFORM_ROUTE, headers=_headers(super_admin, aal="aal1"))
    aal2 = await client.get(PLATFORM_ROUTE, headers=_headers(super_admin, aal="aal2"))
    await db_conn.execute(text(
        "UPDATE platform_settings SET bool_value = false WHERE key = 'mfa_required_for_super_admin'"))
    relaxed = await client.get(PLATFORM_ROUTE, headers=_headers(super_admin, aal="aal1"))

    assert aal1.status_code == 403 and aal1.json()["details"]["code"] == "mfa_enrollment_required"
    assert aal2.status_code == 200
    assert relaxed.status_code == 200


async def test_super_admin_mfa_setting_missing_fails_closed(client, users, db_conn):
    super_admin = await users.create("super_admin")
    await db_conn.execute(text("DELETE FROM platform_settings WHERE key = 'mfa_required_for_super_admin'"))

    response = await client.get(PLATFORM_ROUTE, headers=_headers(super_admin, aal="aal1"))

    assert response.status_code == 403


# ------------------------------------------------------------------ require_member_mfa per membership (L1)


async def _require_member_mfa(db_conn, business_id: str) -> None:
    await db_conn.execute(text(
        "UPDATE business_settings SET require_member_mfa = true WHERE business_id = CAST(:b AS uuid)"
    ), {"b": business_id})


async def test_business_settings_row_created_with_business(client, users, db_conn):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]

    row = await db_conn.execute(text(
        "SELECT require_member_mfa FROM business_settings WHERE business_id = CAST(:b AS uuid)"
    ), {"b": business_id})

    assert row.scalar_one() is False


async def test_require_member_mfa_checked_per_membership(client, users, db_conn):
    owner = await users.create()
    strict = (await create_business(client, owner, "Strict"))["id"]
    relaxed = (await create_business(client, owner, "Relaxed"))["id"]
    member = await users.create_member(owner, strict)
    await add_member(client, owner, strict, member, "full")
    await add_member(client, owner, relaxed, member, "full")
    await _require_member_mfa(db_conn, strict)

    member_aal1 = await client.get(f"/api/v1/businesses/{strict}", headers=_headers(member, aal="aal1"))
    member_other = await client.get(f"/api/v1/businesses/{relaxed}", headers=_headers(member, aal="aal1"))
    member_aal2 = await client.get(f"/api/v1/businesses/{strict}", headers=_headers(member, aal="aal2"))
    owner_aal1 = await client.get(f"/api/v1/businesses/{strict}", headers=_headers(owner, aal="aal1"))

    assert member_aal1.status_code == 403
    assert member_aal1.json()["details"]["code"] == "mfa_enrollment_required"
    assert (member_other.status_code, member_aal2.status_code, owner_aal1.status_code) == (200, 200, 200)


async def test_require_member_mfa_does_not_reveal_foreign_business(client, users, db_conn):
    owner, outsider = await users.create(), await users.create()
    business_id = (await create_business(client, owner))["id"]
    await _require_member_mfa(db_conn, business_id)

    response = await client.get(f"/api/v1/businesses/{business_id}", headers=_headers(outsider, aal="aal1"))

    assert response.status_code == 404


# ------------------------------------------------------------------ GoTrue audit ingest (H1, AC-36)


async def _gotrue_entry(db_conn, action: str, actor_id: str, email: str) -> str:
    entry_id = str(uuid.uuid4())
    payload = {"action": action, "actor_id": actor_id, "actor_username": email, "log_type": "account"}
    await db_conn.execute(text(
        "INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address)"
        " VALUES ('00000000-0000-0000-0000-000000000000', CAST(:id AS uuid), CAST(:p AS json), now(), '10.0.0.9')"
    ), {"id": entry_id, "p": json.dumps(payload)})
    return entry_id


async def test_gotrue_events_ingested_once_with_hashed_email(db_conn, users):
    user = await users.create()
    for action in ("login", "user_updated_password", "token_refreshed", "factor_unenrolled"):
        await _gotrue_entry(db_conn, action, user.id, user.email.upper())

    first = (await db_conn.execute(text("SELECT public.ingest_auth_audit_log(100)"))).scalar_one()
    again = (await db_conn.execute(text("SELECT public.ingest_auth_audit_log(100)"))).scalar_one()
    rows = (await db_conn.execute(text(
        "SELECT action, details FROM audit_logs WHERE user_id = CAST(:u AS uuid) AND source_event_id IS NOT NULL"
        " ORDER BY action"), {"u": user.id})).all()

    assert first >= 3 and again == 0
    assert [r[0] for r in rows] == ["login_succeeded", "mfa_disabled", "password_changed"]
    details = rows[0][1]
    assert details["source"] == "gotrue" and user.email not in json.dumps(details)
    assert len(details["email_hash"]) == 64


async def test_gotrue_ingest_service_drains_in_batches(db_conn, users, monkeypatch):
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.services.auth_audit_service import AuthAuditService

    monkeypatch.setattr(settings, "AUTH_AUDIT_INGEST_BATCH", 2)
    user = await users.create()
    for _ in range(5):
        await _gotrue_entry(db_conn, "login", user.id, user.email)

    async with AsyncSession(bind=db_conn, join_transaction_mode="create_savepoint") as session:
        added = await AuthAuditService(session).ingest_gotrue_events()

    assert added >= 5


async def test_password_hook_audits_failed_and_banned_attempts(db_conn, users):
    user, banned = await users.create(), await users.create()
    await db_conn.execute(text(
        "UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = CAST(:u AS uuid)"
    ), {"u": banned.id})

    decisions = []
    for user_id, valid in ((user.id, False), (user.id, True), (banned.id, True)):
        result = await db_conn.execute(text(
            "SELECT public.password_verification_attempt_hook("
            "jsonb_build_object('user_id', CAST(:u AS text), 'valid', CAST(:v AS boolean)))"
        ), {"u": user_id, "v": valid})
        decisions.append(result.scalar_one()["decision"])

    assert decisions == ["continue"] * 3
    assert await _audit_actions(db_conn, user.id) == ["login_failed"]
    assert await _audit_actions(db_conn, banned.id) == ["banned_login_attempt"]


# ------------------------------------------------------------------ country (M11, D-28)


async def _country_id(db_conn, code: str) -> str:
    return (await db_conn.execute(text("SELECT id::text FROM countries WHERE code = :c"), {"c": code})).scalar_one()


async def _signup_with_meta(db_conn, meta: dict) -> str:
    user_id = str(uuid.uuid4())
    await db_conn.execute(text(
        "INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data,"
        " raw_user_meta_data, created_at, updated_at) VALUES (:id, '00000000-0000-0000-0000-000000000000',"
        " 'authenticated', 'authenticated', :email, '', '{}', CAST(:meta AS jsonb), now(), now())"
    ), {"id": user_id, "email": f"{user_id[:8]}@{EMAIL_DOMAIN}", "meta": json.dumps(meta)})
    return user_id


async def test_signup_country_stored_only_when_it_exists(db_conn):
    pakistan = await _country_id(db_conn, "PK")
    stored = await _signup_with_meta(db_conn, {"country_id": pakistan})
    unknown = await _signup_with_meta(db_conn, {"country_id": str(uuid.uuid4())})
    garbage = await _signup_with_meta(db_conn, {"country_id": "'; DROP TABLE countries; --"})

    rows = dict((await db_conn.execute(text(
        "SELECT user_id::text, country_id::text FROM user_profiles WHERE user_id::text = ANY(:ids)"
    ), {"ids": [stored, unknown, garbage]})).all())

    assert rows == {stored: pakistan, unknown: None, garbage: None}


async def test_profile_country_editable_and_prompt_dismissable(client, users, db_conn):
    user = await users.create()
    germany = await _country_id(db_conn, "DE")

    updated = await client.patch("/api/v1/profile", json={"country_id": germany}, headers=user.headers)
    unknown = await client.patch("/api/v1/profile", json={"country_id": str(uuid.uuid4())}, headers=user.headers)
    dismissed = await client.patch("/api/v1/profile", json={"dismiss_country_prompt": True}, headers=user.headers)

    assert updated.status_code == 200 and updated.json()["country_id"] == germany
    assert unknown.status_code == 422
    assert dismissed.json()["country_prompt_dismissed_at"] is not None
    assert dismissed.json()["country_id"] == germany


async def test_countries_list_is_public_for_the_signup_form(client):
    response = await client.get("/api/v1/countries", params={"search": "Pakistan"})

    assert response.status_code == 200 and response.json()["items"][0]["code"] == "PK"


# ------------------------------------------------------------------ bootstrap super admin (D-29, AC-41)


async def _set_bootstrap(db_conn, email):
    await db_conn.execute(text(
        "UPDATE platform_settings SET text_value = :e WHERE key = 'bootstrap_super_admin_email'"), {"e": email})


async def _signup(db_conn, email, confirmed=False):
    user_id = str(uuid.uuid4())
    await db_conn.execute(text(
        "INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,"
        " raw_app_meta_data, raw_user_meta_data, created_at, updated_at)"
        " VALUES (:id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', :email, '',"
        " CASE WHEN :confirmed THEN now() END, '{}', '{}', now(), now())"
    ), {"id": user_id, "email": email, "confirmed": confirmed})
    return user_id


async def _live_role(db_conn, user_id):
    return (await db_conn.execute(text(
        "SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = CAST(:u AS uuid)"
    ), {"u": user_id})).scalar_one_or_none()


@pytest.fixture
async def no_super_admin(db_conn):
    await db_conn.execute(text(
        "DELETE FROM user_roles WHERE role_id = (SELECT id FROM roles WHERE name = 'super_admin')"))


def _session_on(db_conn):
    from sqlalchemy.ext.asyncio import AsyncSession

    return AsyncSession(bind=db_conn, join_transaction_mode="create_savepoint")


async def _stored_bootstrap(db_conn):
    return (await db_conn.execute(text(
        "SELECT text_value FROM platform_settings WHERE key = 'bootstrap_super_admin_email'"))).scalar_one()


async def test_bootstrap_setting_written_at_startup_matches_env(db_conn, monkeypatch):
    monkeypatch.setattr(settings, "BOOTSTRAP_SUPER_ADMIN_EMAIL", "  Boss@BookVault-Test.dev ")

    async with _session_on(db_conn) as session:
        await run_startup_checks(session)
        await session.commit()  # releases the savepoint into the test transaction

    assert await _stored_bootstrap(db_conn) == BOOTSTRAP


async def test_bootstrap_unset_logs_startup_warning(db_conn, monkeypatch, caplog):
    await _set_bootstrap(db_conn, BOOTSTRAP)
    monkeypatch.setattr(settings, "BOOTSTRAP_SUPER_ADMIN_EMAIL", None)

    with caplog.at_level(logging.WARNING, logger="app.services.startup_service"):
        async with _session_on(db_conn) as session:
            await run_startup_checks(session)
            await session.commit()

    assert await _stored_bootstrap(db_conn) is None
    assert any("BOOTSTRAP_SUPER_ADMIN_EMAIL is not set" in r.getMessage() for r in caplog.records)


async def test_bootstrap_set_logs_no_warning(db_conn, monkeypatch, caplog):
    monkeypatch.setattr(settings, "BOOTSTRAP_SUPER_ADMIN_EMAIL", BOOTSTRAP)

    with caplog.at_level(logging.WARNING, logger="app.services.startup_service"):
        async with _session_on(db_conn) as session:
            await run_startup_checks(session)
            await session.commit()

    assert not any("BOOTSTRAP_SUPER_ADMIN_EMAIL" in r.getMessage() for r in caplog.records)


async def test_bootstrap_email_match_is_case_insensitive_and_requires_verification(db_conn, no_super_admin):
    await _set_bootstrap(db_conn, "  BOSS@bookvault-test.DEV ")

    user_id = await _signup(db_conn, "Boss@BookVault-Test.dev")
    before = await _live_role(db_conn, user_id)
    await db_conn.execute(text(
        "UPDATE auth.users SET email_confirmed_at = now() WHERE id = CAST(:u AS uuid)"), {"u": user_id})

    assert (before, await _live_role(db_conn, user_id)) == ("admin", "super_admin")
    assert "bootstrap_super_admin_promoted" in await _audit_actions(db_conn, user_id)


async def test_bootstrap_promoted_on_first_login_after_confirmation_if_trigger_missed(db_conn, no_super_admin):
    await _set_bootstrap(db_conn, BOOTSTRAP)
    # Confirmed at insert: the confirmation UPDATE trigger never ran.
    user_id = await _signup(db_conn, BOOTSTRAP, confirmed=True)
    before = await _live_role(db_conn, user_id)

    await db_conn.execute(text(
        "UPDATE auth.users SET last_sign_in_at = now() WHERE id = CAST(:u AS uuid)"), {"u": user_id})

    assert (before, await _live_role(db_conn, user_id)) == ("admin", "super_admin")


async def test_email_change_to_bootstrap_email_never_promotes(db_conn, no_super_admin):
    await _set_bootstrap(db_conn, BOOTSTRAP)
    user_id = await _signup(db_conn, f"someone@{EMAIL_DOMAIN}")
    await db_conn.execute(text(
        "UPDATE auth.users SET email_confirmed_at = now(), last_sign_in_at = now() WHERE id = CAST(:u AS uuid)"
    ), {"u": user_id})

    # GoTrue confirms an email change by rewriting email (and the confirmation time) in one update.
    await db_conn.execute(text(
        "UPDATE auth.users SET email = :e, email_confirmed_at = now() WHERE id = CAST(:u AS uuid)"
    ), {"e": BOOTSTRAP, "u": user_id})
    await db_conn.execute(text(
        "UPDATE auth.users SET last_sign_in_at = now() WHERE id = CAST(:u AS uuid)"), {"u": user_id})

    assert await _live_role(db_conn, user_id) == "admin"
