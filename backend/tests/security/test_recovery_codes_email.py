"""Recovery codes emailed when MFA_RECOVERY_CODES_EMAIL is on (B0.7 dev aid)."""

import logging

import httpx
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.services import mail_service
from tests.security.test_auth_hardening import CODES, _audit_actions, _headers, _mfa_user

MAILPIT_API = "http://127.0.0.1:55344/api/v1"


class FakeSMTP:
    sent: list = []
    fail = False

    def __init__(self, host, port, timeout=None):
        self.address = (host, port)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def send_message(self, message):
        if FakeSMTP.fail:
            raise ConnectionRefusedError("smtp down")
        FakeSMTP.sent.append(message)


@pytest.fixture
def fake_smtp(monkeypatch):
    FakeSMTP.sent, FakeSMTP.fail = [], False
    monkeypatch.setattr(mail_service.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(settings, "SMTP_TLS", "none")
    monkeypatch.setattr(settings, "SMTP_USER", None)
    return FakeSMTP


async def _audit_text(db_conn, user_id: str) -> str:
    rows = await db_conn.execute(text(
        "SELECT row_to_json(a)::text FROM audit_logs a WHERE user_id = CAST(:u AS uuid)"), {"u": user_id})
    return " ".join(r[0] for r in rows.all())


def _assert_no_codes(codes: list[str], *haystacks: str) -> None:
    for code in codes:
        assert not any(code in h or code.replace("-", "") in h for h in haystacks)


async def test_flag_off_sends_no_email(client, users, db_conn, fake_smtp, monkeypatch):
    monkeypatch.setattr(settings, "MFA_RECOVERY_CODES_EMAIL", False)
    user = await _mfa_user(users, db_conn)

    created = await client.post(CODES, headers=_headers(user))

    assert created.status_code == 201
    assert fake_smtp.sent == []
    assert "recovery_codes_emailed" not in await _audit_actions(db_conn, user.id)


async def test_flag_on_sends_one_email_with_all_codes(client, users, db_conn, fake_smtp, monkeypatch, caplog):
    monkeypatch.setattr(settings, "MFA_RECOVERY_CODES_EMAIL", True)
    monkeypatch.setattr(settings, "MFA_RECOVERY_CODE_COUNT", 6)
    user = await _mfa_user(users, db_conn)
    caplog.set_level(logging.DEBUG)

    created = await client.post(CODES, headers=_headers(user))

    codes = created.json()["codes"]
    assert created.status_code == 201 and len(codes) == 6
    assert len(fake_smtp.sent) == 1
    message = fake_smtp.sent[0]
    assert message["To"] == user.email and message["Subject"] == "Your BookVault recovery codes"
    plain = message.get_body(("plain",)).get_content()
    html_part = message.get_body(("html",)).get_content()
    for body in (plain, html_part):
        assert all(c in body for c in codes)
        assert "Each code works once." in body and "Generating new codes invalidates these." in body
        assert "generated" in body and "UTC" in body
    assert (await _audit_actions(db_conn, user.id)).count("recovery_codes_emailed") == 1
    _assert_no_codes(codes, caplog.text, await _audit_text(db_conn, user.id))


async def test_send_failure_keeps_codes_and_logs_without_them(
    client, users, db_conn, fake_smtp, monkeypatch, caplog
):
    monkeypatch.setattr(settings, "MFA_RECOVERY_CODES_EMAIL", True)
    fake_smtp.fail = True
    user = await _mfa_user(users, db_conn)
    caplog.set_level(logging.DEBUG)

    created = await client.post(CODES, headers=_headers(user))

    codes = created.json()["codes"]
    assert created.status_code == 201 and len(codes) == settings.MFA_RECOVERY_CODE_COUNT
    assert "Recovery codes email failed" in caplog.text
    assert "recovery_codes_emailed" not in await _audit_actions(db_conn, user.id)
    _assert_no_codes(codes, caplog.text, await _audit_text(db_conn, user.id))


async def test_mailpit_receives_codes(client, users, db_conn, monkeypatch):
    """Integration with the local Mailpit (skipped when it is not running)."""
    try:
        httpx.get(f"{MAILPIT_API}/messages", timeout=2).raise_for_status()
    except httpx.HTTPError:
        pytest.skip("Mailpit not reachable")
    monkeypatch.setattr(settings, "MFA_RECOVERY_CODES_EMAIL", True)
    monkeypatch.setattr(settings, "SMTP_HOST", "127.0.0.1")
    monkeypatch.setattr(settings, "SMTP_PORT", 55345)
    monkeypatch.setattr(settings, "SMTP_TLS", "none")
    monkeypatch.setattr(settings, "SMTP_USER", None)
    user = await _mfa_user(users, db_conn)

    codes = (await client.post(CODES, headers=_headers(user))).json()["codes"]

    found = httpx.get(f"{MAILPIT_API}/search", params={"query": f"to:{user.email}"}, timeout=5).json()
    assert found["messages_count"] == 1
    message = httpx.get(f"{MAILPIT_API}/message/{found['messages'][0]['ID']}", timeout=5).json()
    assert message["Subject"] == "Your BookVault recovery codes"
    assert all(c in message["Text"] for c in codes)
