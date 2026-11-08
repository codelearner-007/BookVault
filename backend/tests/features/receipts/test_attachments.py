"""B3 attachments on documents (NA-04, AC-26): type from bytes, size and quota limits, signed links."""

import pytest

from app.core.config import settings
from tests.support.factories import add_member, create_bank_account, create_business, receipt_body
from tests.support.ledger import biz, create_account

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
PDF = b"%PDF-1.7\n%test\n"


@pytest.fixture
async def receipt(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    bank = await create_bank_account(client, owner, bid)
    income = await create_account(client, owner, bid, "Service income", "income")
    created = await client.post(biz(bid, "/receipts"), json=receipt_body(bank["id"], [(income, "5")]),
                                headers=owner.headers)
    return owner, bid, created.json()["id"]


async def _upload(client, user, bid, document_id, content, name="scan.png"):
    return await client.post(biz(bid, "/attachments"), params={"document_id": document_id, "name": name},
                             content=content, headers={**user.headers, "Content-Type": "application/octet-stream"})


async def test_upload_list_signed_url_and_delete(client, receipt):
    owner, bid, doc = receipt
    uploaded = await _upload(client, owner, bid, doc, PNG, name="../../etc/scan.png")
    assert uploaded.status_code == 201, uploaded.text
    item = uploaded.json()
    assert item["mime_type"] == "image/png" and item["original_name"] == "scan.png"
    listed = (await client.get(biz(bid, "/attachments"), params={"document_id": doc}, headers=owner.headers)).json()
    link = (await client.get(biz(bid, f"/attachments/{item['id']}/url"), headers=owner.headers)).json()
    content = await client.get(link["url"])
    assert listed["total"] == 1
    assert content.status_code == 200 and content.content == PNG
    assert content.headers["content-type"] == "image/png" and content.headers["x-content-type-options"] == "nosniff"
    removed = await client.delete(biz(bid, f"/attachments/{item['id']}"), headers=owner.headers)
    gone = await client.get(link["url"])
    assert removed.status_code == 204 and gone.status_code == 404


async def test_upload_mime_mismatch_rejected(client, receipt):
    owner, bid, doc = receipt
    response = await _upload(client, owner, bid, doc, b"<svg onload=alert(1)>", name="fake.png")
    assert response.status_code == 415 and response.json()["details"]["code"] == "file_type_not_allowed"


async def test_upload_over_size_limit_rejected(client, receipt, monkeypatch):
    owner, bid, doc = receipt
    monkeypatch.setattr(settings, "ATTACHMENT_MAX_BYTES", len(PDF) - 1)
    response = await _upload(client, owner, bid, doc, PDF, name="big.pdf")
    assert response.status_code == 413 and response.json()["details"]["code"] == "file_too_large"


async def test_upload_over_storage_quota_rejected(client, receipt, monkeypatch):
    owner, bid, doc = receipt
    monkeypatch.setattr(settings, "ATTACHMENT_QUOTA_BYTES", len(PNG) + 1)
    assert (await _upload(client, owner, bid, doc, PNG)).status_code == 201
    response = await _upload(client, owner, bid, doc, PNG)
    assert response.status_code == 409 and response.json()["details"]["code"] == "storage_quota_exceeded"


async def test_signed_url_only_for_members(client, receipt, users):
    owner, bid, doc = receipt
    item = (await _upload(client, owner, bid, doc, PNG)).json()
    stranger = await users.create("admin")
    asked = await client.get(biz(bid, f"/attachments/{item['id']}/url"), headers=stranger.headers)
    member = await users.create_member(owner, bid)
    await add_member(client, owner, bid, member, areas=[{"area_key": "payments", "rights": ["view"]}])
    no_right = await client.get(biz(bid, f"/attachments/{item['id']}/url"), headers=member.headers)
    tampered = await client.get("/api/v1/attachments/content", params={"token": "e30.forged"})
    # RLS hides the attachment of an area the member cannot view: same 404 as for a stranger.
    assert asked.status_code == no_right.status_code == tampered.status_code == 404


async def test_upload_requires_auth_401(client, receipt):
    _, bid, doc = receipt
    response = await client.post(biz(bid, "/attachments"), params={"document_id": doc}, content=PNG)
    assert response.status_code == 401
