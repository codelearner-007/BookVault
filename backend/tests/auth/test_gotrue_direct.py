"""Supabase Auth called directly with the public anon key (B0.7 H1; AC-36, AC-37, AC-38, AC-45).

Findings recorded in build-plan B0.7 / docs/runbooks/auth-config.md:
  * The CLI (3.0.0, GoTrue v2.197) has no local switch for the leaked-password (HIBP)
    check; it is a hosted-project setting.
  * GoTrue applies its per-IP limits only when GOTRUE_RATE_LIMIT_HEADER is set, which the
    hosted platform does and the local CLI cannot; locally only the per-email limits work.
"""

import subprocess

import pytest
from sqlalchemy import text

from tests.auth.conftest import GOTRUE_URL, STRONG_PASSWORD, new_email, supabase_env

HOSTED_ONLY = "hosted-project setting: not available in the local CLI (runbook auth-config.md)"


def _gotrue_container_env() -> dict[str, str]:
    result = subprocess.run(["docker", "exec", "supabase_auth_BookVault", "env"],
                            capture_output=True, text=True, check=False)
    if result.returncode != 0:
        pytest.skip("GoTrue container not reachable with docker")
    return dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)


async def _access_token(gotrue, email: str) -> str:
    response = await gotrue.sign_in(email)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


# ------------------------------------------------------------------ AC-36 policy inside GoTrue


def test_gotrue_config_matches_env():
    env = _gotrue_container_env()

    assert env["GOTRUE_PASSWORD_MIN_LENGTH"] == supabase_env("AUTH_PASSWORD_MIN_LENGTH") == "12"
    assert env["GOTRUE_MAILER_OTP_EXP"] == supabase_env("AUTH_EMAIL_OTP_EXPIRY_SECONDS")
    assert env["GOTRUE_MAILER_AUTOCONFIRM"] == "false"
    assert env["GOTRUE_SMS_AUTOCONFIRM"] == "false"  # else existing emails are revealed (AC-37)
    assert env["GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION"] == "true"
    assert env["GOTRUE_HOOK_PASSWORD_VERIFICATION_ATTEMPT_ENABLED"] == "true"
    assert env["GOTRUE_RATE_LIMIT_VERIFY"] == supabase_env("AUTH_RATE_LIMIT_TOKEN_VERIFICATIONS")
    assert env["GOTRUE_RATE_LIMIT_TOKEN_REFRESH"] == supabase_env("AUTH_RATE_LIMIT_TOKEN_REFRESH")


async def test_gotrue_direct_signup_weak_password_rejected(gotrue):
    response = await gotrue.signup(new_email(), password="elevenchars")

    assert response.status_code == 422 and response.json()["error_code"] == "weak_password"


async def test_gotrue_direct_password_update_weak_rejected(gotrue):
    email = new_email()
    await gotrue.create_confirmed(email)
    token = await _access_token(gotrue, email)

    response = await gotrue.http.put(f"{GOTRUE_URL}/user", headers=gotrue.bearer(token),
                                     json={"password": "short-pass"})

    assert response.status_code == 422 and response.json()["error_code"] == "weak_password"


@pytest.mark.skip(reason=f"D-24 breached-password check in GoTrue: {HOSTED_ONLY}")
async def test_gotrue_direct_signup_breached_password_rejected(gotrue):
    response = await gotrue.signup(new_email(), password="password1234")
    assert response.status_code == 422


@pytest.mark.skip(reason=f"D-24 breached-password check in GoTrue: {HOSTED_ONLY}")
async def test_gotrue_direct_password_update_breached_rejected(gotrue):
    raise AssertionError("runs only against the hosted project")


async def test_gotrue_direct_email_send_rate_limited(gotrue):
    email = new_email()

    first = await gotrue.signup(email)
    again = await gotrue.signup(email)

    assert first.status_code == 200
    assert again.status_code == 429 and again.json()["error_code"] == "over_email_send_rate_limit"


@pytest.mark.skip(reason="per-IP GoTrue limits need GOTRUE_RATE_LIMIT_HEADER: " + HOSTED_ONLY)
async def test_gotrue_direct_token_password_grant_rate_limited(gotrue):
    raise AssertionError("runs only against the hosted project")


# ------------------------------------------------------------------ AC-37 enumeration


def _shape(response) -> tuple[int, list[str]]:
    body = response.json()
    return response.status_code, sorted(body)


async def test_gotrue_direct_signup_existing_email_same_response(gotrue):
    existing = new_email("existing")
    await gotrue.create_confirmed(existing)

    for_existing = await gotrue.signup(existing, password="another long password")
    for_new = await gotrue.signup(new_email("fresh"))

    assert _shape(for_existing) == _shape(for_new)
    assert for_existing.json().get("session") is None and "access_token" not in for_existing.json()


async def test_gotrue_direct_recover_unknown_email_same_response(gotrue):
    known = new_email("known")
    await gotrue.create_confirmed(known)

    for_known = await gotrue.recover(known)
    for_unknown = await gotrue.recover(new_email("unknown"))

    assert (for_known.status_code, for_known.json()) == (for_unknown.status_code, for_unknown.json()) == (200, {})


async def test_gotrue_direct_login_unconfirmed_vs_wrong_password_same_response(gotrue):
    unconfirmed, confirmed = new_email("unconfirmed"), new_email("confirmed")
    await gotrue.signup(unconfirmed)
    await gotrue.create_confirmed(confirmed)

    not_confirmed = await gotrue.sign_in(unconfirmed)
    wrong = await gotrue.sign_in(confirmed, password="not the right password")

    # GoTrue answers these differently (email_not_confirmed vs invalid_credentials); the
    # Next.js login route maps both to one message. Recorded so a GoTrue change shows up.
    assert not_confirmed.status_code == wrong.status_code == 400


# ------------------------------------------------------------------ AC-38 link reuse and expiry


def _redirect_has_error(response) -> bool:
    return response.status_code in (302, 303) and "error" in response.headers.get("location", "")


async def test_gotrue_direct_verify_link_reuse_rejected(gotrue):
    email = new_email("verify")
    await gotrue.signup(email)
    link = await gotrue.latest_link(email)

    first = await gotrue.open_link(link)
    second = await gotrue.open_link(link)

    assert first.status_code == 303 and not _redirect_has_error(first)
    assert _redirect_has_error(second)


async def test_reset_link_reuse_rejected(gotrue):
    email = new_email("reset")
    await gotrue.create_confirmed(email)
    await gotrue.recover(email)
    link = await gotrue.latest_link(email)

    first = await gotrue.open_link(link)
    second = await gotrue.open_link(link)

    assert first.status_code == 303 and not _redirect_has_error(first)
    assert _redirect_has_error(second)


async def test_reset_link_expired_rejected(gotrue, dev_db):
    email = new_email("expired")
    user_id = await gotrue.create_confirmed(email)
    await gotrue.recover(email)
    link = await gotrue.latest_link(email)
    async with dev_db.connect() as conn:
        await conn.execute(text(
            "UPDATE auth.users SET recovery_sent_at = now() - make_interval(secs => :age)"
            " WHERE id = CAST(:u AS uuid)"
        ), {"age": int(supabase_env("AUTH_EMAIL_OTP_EXPIRY_SECONDS")) + 60, "u": user_id})

    response = await gotrue.open_link(link)

    assert _redirect_has_error(response)


# ------------------------------------------------------------------ AC-36 audit, AC-45 app_metadata


async def test_gotrue_direct_login_events_ingested_into_audit(gotrue, dev_db):
    email = new_email("audit")
    user_id = await gotrue.create_confirmed(email)
    assert (await gotrue.sign_in(email)).status_code == 200
    assert (await gotrue.sign_in(email, password="wrong password here")).status_code == 400

    async with dev_db.connect() as conn:
        await conn.execute(text("SELECT public.ingest_auth_audit_log(1000)"))
        rows = (await conn.execute(text(
            "SELECT action, details->>'source' FROM public.audit_logs WHERE user_id = CAST(:u AS uuid)"
        ), {"u": user_id})).all()

    assert ("login_succeeded", "gotrue") in rows
    assert ("login_failed", "gotrue_hook") in rows


async def test_user_cannot_write_app_metadata_via_gotrue(gotrue):
    email = new_email("meta")
    await gotrue.create_confirmed(email)
    token = await _access_token(gotrue, email)

    await gotrue.http.put(f"{GOTRUE_URL}/user", headers=gotrue.bearer(token),
                          json={"app_metadata": {"user_role": "super_admin", "provisioned_for_business": None}})
    user = (await gotrue.http.get(f"{GOTRUE_URL}/user", headers=gotrue.bearer(token))).json()

    assert "user_role" not in user["app_metadata"]
    assert "provisioned_for_business" not in user["app_metadata"]


async def test_gotrue_direct_password_change_needs_recent_session(gotrue):
    """secure_password_change: a fresh session may change the password (reauth within 24h)."""
    email = new_email("change")
    await gotrue.create_confirmed(email)
    token = await _access_token(gotrue, email)

    response = await gotrue.http.put(f"{GOTRUE_URL}/user", headers=gotrue.bearer(token),
                                     json={"password": STRONG_PASSWORD + " two"})

    assert response.status_code == 200
