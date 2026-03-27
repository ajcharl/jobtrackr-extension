"""
Gmail API integration - fetch emails using OAuth2 tokens.
Read-only access via Gmail API REST endpoints.
"""

import base64
from datetime import datetime, timedelta, timezone

import httpx

from ..config import settings

GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# Read-only Gmail scope
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
]


def get_auth_url() -> str:
    """Build the Google OAuth2 authorization URL."""
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(GMAIL_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{qs}"


async def exchange_code(code: str) -> dict:
    """Exchange authorization code for access + refresh tokens."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.google_redirect_uri,
        })
        resp.raise_for_status()
        return resp.json()


async def refresh_access_token(refresh_token: str) -> dict:
    """Refresh an expired access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        return resp.json()


async def get_user_email(access_token: str) -> str:
    """Get the authenticated user's email address."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("email", "")


async def fetch_recent_emails(
    access_token: str,
    max_results: int = 50,
    days_back: int = 7,
) -> list[dict]:
    """
    Fetch recent emails from Gmail.
    Returns list of dicts with: id, subject, sender, date, snippet, body.
    """
    after_date = datetime.now(timezone.utc) - timedelta(days=days_back)
    after_epoch = int(after_date.timestamp())

    async with httpx.AsyncClient() as client:
        # List messages
        list_resp = await client.get(
            f"{GMAIL_API_BASE}/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "maxResults": max_results,
                "q": f"after:{after_epoch} category:primary",
            },
        )
        list_resp.raise_for_status()
        messages_list = list_resp.json().get("messages", [])

        emails = []
        for msg_stub in messages_list:
            msg_id = msg_stub["id"]
            # Get full message
            msg_resp = await client.get(
                f"{GMAIL_API_BASE}/messages/{msg_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"format": "full"},
            )
            if msg_resp.status_code != 200:
                continue

            msg_data = msg_resp.json()
            emails.append(_parse_message(msg_data))

        return emails


def _parse_message(msg_data: dict) -> dict:
    """Parse a Gmail API message into a simplified dict."""
    headers = {h["name"].lower(): h["value"] for h in msg_data.get("payload", {}).get("headers", [])}

    subject = headers.get("subject", "(no subject)")
    sender = headers.get("from", "")
    date_str = headers.get("date", "")

    # Parse date
    email_date = None
    try:
        # Gmail dates can be complex; internal date is more reliable (ms since epoch)
        internal_date_ms = int(msg_data.get("internalDate", 0))
        if internal_date_ms:
            email_date = datetime.fromtimestamp(internal_date_ms / 1000, tz=timezone.utc)
    except (ValueError, TypeError):
        pass

    snippet = msg_data.get("snippet", "")
    body = _extract_body(msg_data.get("payload", {}))

    return {
        "id": msg_data["id"],
        "subject": subject,
        "sender": sender,
        "date": email_date,
        "snippet": snippet,
        "body": body,
    }


def _extract_body(payload: dict) -> str:
    """Extract plain text body from a Gmail message payload."""
    # Try direct body
    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        return _decode_base64(payload["body"]["data"])

    # Try multipart
    for part in payload.get("parts", []):
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return _decode_base64(part["body"]["data"])
        # Nested multipart
        if part.get("parts"):
            result = _extract_body(part)
            if result:
                return result

    return ""


def _decode_base64(data: str) -> str:
    """Decode URL-safe base64 encoded string."""
    try:
        padded = data + "=" * (4 - len(data) % 4)
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""
