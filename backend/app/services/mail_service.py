"""Outgoing email over SMTP (settings.SMTP_*). One place for every email the API sends."""

import asyncio
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings


def _build_message(to: str, subject: str, text_body: str, html_body: str) -> EmailMessage:
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    return message


def _send_blocking(message: EmailMessage) -> None:
    timeout = settings.SMTP_TIMEOUT_SECONDS
    if settings.SMTP_TLS == "ssl":
        smtp = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=timeout,
                                context=ssl.create_default_context())
    else:
        smtp = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=timeout)
    with smtp:
        if settings.SMTP_TLS == "starttls":
            smtp.starttls(context=ssl.create_default_context())
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
        smtp.send_message(message)


async def send_email(to: str, subject: str, text_body: str, html_body: str) -> None:
    """Send one email with a plain-text and an HTML part. Raises on SMTP failure."""
    await asyncio.to_thread(_send_blocking, _build_message(to, subject, text_body, html_body))
