"""Uploaded files: type from the bytes (never the client's MIME type or name) and signed links (AC-26)."""

import base64
import hashlib
import hmac
import json
import time

from app.core.config import settings

# Magic-byte signatures of the allowed types (no SVG/HTML: they can carry active content).
_SIGNATURES = (
    ("image/jpeg", b"\xff\xd8\xff"),
    ("image/png", b"\x89PNG\r\n\x1a\n"),
    ("image/gif", b"GIF8"),
    ("application/pdf", b"%PDF-"),
)
_RIFF, _WEBP, _WEBP_OFFSET = b"RIFF", b"WEBP", 8
_LINK_LABEL = b"bookvault-attachment-link-v1"


def detect_mime_type(content: bytes) -> str | None:
    for mime, signature in _SIGNATURES:
        if content.startswith(signature):
            return mime
    if content.startswith(_RIFF) and content[_WEBP_OFFSET:_WEBP_OFFSET + len(_WEBP)] == _WEBP:
        return "image/webp"
    return None


def safe_file_name(name: str | None) -> str:
    """Display name only (never a storage path): last path segment, no control characters."""
    base = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    cleaned = "".join(ch for ch in base if ch.isprintable()).strip()[:255]
    return cleaned or "attachment"


def _key() -> bytes:
    return hmac.new(settings.JWT_SECRET.encode(), _LINK_LABEL, hashlib.sha256).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def sign_link(claims: dict, ttl_seconds: int) -> tuple[str, int]:
    """Token = payload.signature; payload carries an expiry (epoch seconds)."""
    expires = int(time.time()) + ttl_seconds
    payload = _b64(json.dumps({**claims, "exp": expires}, separators=(",", ":")).encode())
    signature = _b64(hmac.new(_key(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}", expires


def verify_link(token: str) -> dict | None:
    """The claims of a valid, unexpired token; None otherwise (constant-time comparison)."""
    payload, _, signature = token.partition(".")
    expected = _b64(hmac.new(_key(), payload.encode(), hashlib.sha256).digest())
    if not payload or not hmac.compare_digest(signature, expected):
        return None
    try:
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except ValueError:
        return None
    return claims if isinstance(claims, dict) and claims.get("exp", 0) > time.time() else None
