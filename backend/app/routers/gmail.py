"""
Gmail OAuth routes: connect, callback, status, disconnect.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import GmailToken
from ..schemas import GmailStatusResponse
from ..services.gmail_service import exchange_code, get_auth_url, get_user_email

router = APIRouter(prefix="/gmail", tags=["gmail"])


async def _get_token(db: AsyncSession) -> GmailToken | None:
    """Get the single stored Gmail token (single-user app)."""
    result = await db.execute(select(GmailToken).order_by(GmailToken.id.desc()).limit(1))
    return result.scalars().first()


@router.get("/connect")
async def gmail_connect():
    """Redirect user to Google OAuth consent screen."""
    return RedirectResponse(url=get_auth_url())


@router.get("/callback")
async def gmail_callback(code: str | None = None, error: str | None = None, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback."""
    if error:
        return RedirectResponse(url="http://localhost:3000?gmail_error=" + error)

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    try:
        token_data = await exchange_code(code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {e}")

    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token", "")
    expires_in = token_data.get("expires_in", 3600)
    token_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    # Get user email
    email = ""
    try:
        email = await get_user_email(access_token)
    except Exception:
        pass

    # Upsert: delete old tokens, insert new one (single-user)
    old_tokens = await db.execute(select(GmailToken))
    for old in old_tokens.scalars().all():
        await db.delete(old)

    gmail_token = GmailToken(
        access_token=access_token,
        refresh_token=refresh_token,
        token_expiry=token_expiry,
        email=email,
    )
    db.add(gmail_token)
    await db.commit()

    # Redirect back to frontend
    return RedirectResponse(url="http://localhost:3000?gmail_connected=true")


@router.get("/status", response_model=GmailStatusResponse)
async def gmail_status(db: AsyncSession = Depends(get_db)):
    """Check if Gmail is connected."""
    token = await _get_token(db)
    if not token:
        return GmailStatusResponse(connected=False)
    return GmailStatusResponse(connected=True, email=token.email)


@router.post("/disconnect", status_code=204)
async def gmail_disconnect(db: AsyncSession = Depends(get_db)):
    """Remove stored Gmail tokens."""
    tokens = await db.execute(select(GmailToken))
    for token in tokens.scalars().all():
        await db.delete(token)
    await db.commit()
