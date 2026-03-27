"""
Yahoo Mail OAuth routes: connect, callback, status, disconnect.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import YahooToken
from ..schemas import YahooStatusResponse
from ..services.yahoo_service import exchange_code, get_auth_url, get_user_email

router = APIRouter(prefix="/yahoo", tags=["yahoo"])


async def _get_token(db: AsyncSession) -> YahooToken | None:
    result = await db.execute(select(YahooToken).order_by(YahooToken.id.desc()).limit(1))
    return result.scalars().first()


@router.get("/connect")
async def yahoo_connect():
    """Redirect user to Yahoo OAuth consent screen."""
    return RedirectResponse(url=get_auth_url())


@router.get("/callback")
async def yahoo_callback(
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle Yahoo OAuth callback."""
    if error:
        return RedirectResponse(url="http://localhost:3000?yahoo_error=" + error)

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

    email = ""
    try:
        email = await get_user_email(access_token)
    except Exception:
        pass

    # Upsert: remove old tokens, store new one
    old = await db.execute(select(YahooToken))
    for t in old.scalars().all():
        await db.delete(t)

    yahoo_token = YahooToken(
        access_token=access_token,
        refresh_token=refresh_token,
        token_expiry=token_expiry,
        email=email,
    )
    db.add(yahoo_token)
    await db.commit()

    return RedirectResponse(url="http://localhost:3000?yahoo_connected=true")


@router.get("/status", response_model=YahooStatusResponse)
async def yahoo_status(db: AsyncSession = Depends(get_db)):
    """Check if Yahoo Mail is connected."""
    token = await _get_token(db)
    if not token:
        return YahooStatusResponse(connected=False)
    return YahooStatusResponse(connected=True, email=token.email)


@router.post("/disconnect", status_code=204)
async def yahoo_disconnect(db: AsyncSession = Depends(get_db)):
    """Remove stored Yahoo tokens."""
    tokens = await db.execute(select(YahooToken))
    for token in tokens.scalars().all():
        await db.delete(token)
    await db.commit()
