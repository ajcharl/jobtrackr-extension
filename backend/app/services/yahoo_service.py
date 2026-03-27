"""
Yahoo Mail integration - fetch emails via IMAP with OAuth2 (XOAUTH2).
Read-only access using Yahoo OAuth2 tokens.
"""

import asyncio
import base64
import email
import imaplib
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime

import httpx

from ..config import settings

YAHOO_AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth"
YAHOO_TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token"
YAHOO_USERINFO_URL = "https://api.login.yahoo.com/openid/v1/userinfo"

YAHOO_IMAP_HOST = "imap.mail.yahoo.com"
YAHOO_IMAP_PORT = 993

YAHOO_SCOPES = ["mail-r", "openid", "profile"]


def get_auth_url() -> str:
    """Build the Yahoo OAuth2 authorization URL."""
    from urllib.parse import urlencode
    params = {
        "client_id": settings.yahoo_client_id,
        "redirect_uri": settings.yahoo_redirect_uri,
        "response_type": "code",
        "scope": " ".join(YAHOO_SCOPES),
    }
    return f"{YAHOO_AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> dict:
    """Exchange authorization code for access + refresh tokens."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            YAHOO_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.yahoo_redirect_uri,
            },
            auth=(settings.yahoo_client_id, settings.yahoo_client_secret),
        )
        resp.raise_for_status()
        return resp.json()


async def refresh_access_token(refresh_token: str) -> dict:
    """Refresh an expired Yahoo access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            YAHOO_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            auth=(settings.yahoo_client_id, settings.yahoo_client_secret),
        )
        resp.raise_for_status()
        return resp.json()


async def get_user_email(access_token: str) -> str:
    """Get the authenticated Yahoo user's email address."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            YAHOO_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("email", "")


def _oauth2_string(username: str, access_token: str) -> str:
    """Build the XOAUTH2 authentication string for IMAP."""
    auth_str = f"user={username}\x01auth=Bearer {access_token}\x01\x01"
    return base64.b64encode(auth_str.encode()).decode()


def _decode_header_value(raw: str) -> str:
    """Decode an email header value that may be encoded."""
    parts = decode_header(raw)
    result = ""
    for part, encoding in parts:
        if isinstance(part, bytes):
            result += part.decode(encoding or "utf-8", errors="replace")
        else:
            result += str(part)
    return result


def _fetch_emails_sync(
    username: str,
    access_token: str,
    days_back: int = 7,
    max_results: int = 50,
) -> list[dict]:
    """Synchronous IMAP fetch — runs in a thread executor."""
    imap = imaplib.IMAP4_SSL(YAHOO_IMAP_HOST, YAHOO_IMAP_PORT)
    auth_string = _oauth2_string(username, access_token)
    imap.authenticate("XOAUTH2", lambda x: auth_string)

    imap.select("INBOX")

    since_date = (datetime.now() - timedelta(days=days_back)).strftime("%d-%b-%Y")
    status, data = imap.search(None, f"SINCE {since_date}")
    if status != "OK":
        imap.logout()
        return []

    id_list = data[0].split()
    # Newest first, limit to max_results
    id_list = id_list[-max_results:][::-1]

    emails = []
    for msg_id in id_list:
        status, msg_data = imap.fetch(msg_id, "(RFC822)")
        if status != "OK" or not msg_data or not msg_data[0]:
            continue

        raw = msg_data[0][1]
        parsed = email.message_from_bytes(raw)

        subject = _decode_header_value(parsed.get("Subject", ""))
        sender = parsed.get("From", "")

        # Parse date
        try:
            email_date = parsedate_to_datetime(parsed.get("Date", ""))
            if email_date.tzinfo is None:
                email_date = email_date.replace(tzinfo=timezone.utc)
        except Exception:
            email_date = datetime.now(timezone.utc)

        # Extract plain text body
        body = ""
        if parsed.is_multipart():
            for part in parsed.walk():
                if part.get_content_type() == "text/plain":
                    payload = part.get_payload(decode=True)
                    if payload:
                        body = payload.decode(
                            part.get_content_charset() or "utf-8", errors="replace"
                        )
                        break
        else:
            payload = parsed.get_payload(decode=True)
            if payload:
                body = payload.decode(
                    parsed.get_content_charset() or "utf-8", errors="replace"
                )

        snippet = body[:200].replace("\n", " ").strip()

        # Build a unique ID from IMAP message number + timestamp
        unique_id = f"yahoo_{msg_id.decode()}_{int(email_date.timestamp())}"

        emails.append({
            "id": unique_id,
            "subject": subject or "(no subject)",
            "sender": sender,
            "date": email_date,
            "snippet": snippet,
            "body": body,
        })

    imap.logout()
    return emails


async def fetch_recent_emails(
    username: str,
    access_token: str,
    max_results: int = 50,
    days_back: int = 7,
) -> list[dict]:
    """Fetch recent emails from Yahoo Mail via IMAP (async wrapper)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        _fetch_emails_sync,
        username,
        access_token,
        days_back,
        max_results,
    )
