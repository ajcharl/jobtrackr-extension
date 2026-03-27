"""
Email sync routes: run sync, list suggestions, act on suggestions.
Supports Gmail and Yahoo Mail.
Uses the modular email_pipeline for filtering, scoring, and classification.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import ApplicationUpdateSuggestion, GmailToken, Job, YahooToken
from ..schemas import SuggestionAction, SuggestionResponse
from ..services.email_pipeline import process_email
from ..services.gmail_service import fetch_recent_emails as gmail_fetch
from ..services.gmail_service import refresh_access_token as gmail_refresh
from ..services.yahoo_service import fetch_recent_emails as yahoo_fetch
from ..services.yahoo_service import refresh_access_token as yahoo_refresh

router = APIRouter(prefix="/email-sync", tags=["email-sync"])


async def _get_valid_gmail_token(db: AsyncSession) -> GmailToken | None:
    """Return a valid Gmail token, refreshing if needed. Returns None if not connected."""
    result = await db.execute(select(GmailToken).order_by(GmailToken.id.desc()).limit(1))
    token = result.scalars().first()
    if not token:
        return None

    if token.token_expiry and token.token_expiry < datetime.now(timezone.utc) + timedelta(minutes=5):
        try:
            refreshed = await gmail_refresh(token.refresh_token)
            token.access_token = refreshed["access_token"]
            token.token_expiry = datetime.now(timezone.utc) + timedelta(
                seconds=refreshed.get("expires_in", 3600)
            )
            if "refresh_token" in refreshed:
                token.refresh_token = refreshed["refresh_token"]
            await db.commit()
            await db.refresh(token)
        except Exception:
            return None

    return token


async def _get_valid_yahoo_token(db: AsyncSession) -> YahooToken | None:
    """Return a valid Yahoo token, refreshing if needed. Returns None if not connected."""
    result = await db.execute(select(YahooToken).order_by(YahooToken.id.desc()).limit(1))
    token = result.scalars().first()
    if not token:
        return None

    if token.token_expiry and token.token_expiry < datetime.now(timezone.utc) + timedelta(minutes=5):
        try:
            refreshed = await yahoo_refresh(token.refresh_token)
            token.access_token = refreshed["access_token"]
            token.token_expiry = datetime.now(timezone.utc) + timedelta(
                seconds=refreshed.get("expires_in", 3600)
            )
            if "refresh_token" in refreshed:
                token.refresh_token = refreshed["refresh_token"]
            await db.commit()
            await db.refresh(token)
        except Exception:
            return None

    return token


async def _process_emails(
    db: AsyncSession,
    emails: list[dict],
    jobs: list[dict],
    existing_ids: set,
    id_field: str,
    min_confidence: str = "HIGH",
) -> tuple[int, int]:
    """Run emails through the pipeline and create suggestions."""
    new_suggestions = 0
    skipped = 0

    for email_data in emails:
        msg_id = email_data["id"]

        if msg_id in existing_ids:
            skipped += 1
            continue

        # Run through the full pipeline
        result = process_email(email_data, jobs, min_confidence=min_confidence)
        if result is None:
            continue

        kwargs = {
            "application_id": result.matched_application_id,
            "detected_type": result.classification,
            "suggested_status": result.suggested_status,
            "confidence_score": result.confidence,
            "email_subject": result.email_subject,
            "email_sender": result.email_sender,
            "email_date": result.email_date,
            "email_snippet": result.email_snippet,
            "state": "pending",
        }
        kwargs[id_field] = msg_id

        db.add(ApplicationUpdateSuggestion(**kwargs))
        new_suggestions += 1

    return new_suggestions, skipped


@router.post("/run")
async def run_email_sync(
    confidence: str = "HIGH",
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch recent emails from all connected providers,
    run them through the detection pipeline, and create suggestions.

    Query params:
        confidence: minimum confidence level — "HIGH" (default), "MEDIUM", or "LOW"
    """
    gmail_token = await _get_valid_gmail_token(db)
    yahoo_token = await _get_valid_yahoo_token(db)

    if not gmail_token and not yahoo_token:
        raise HTTPException(
            status_code=400,
            detail="No email provider connected. Please connect Gmail or Yahoo Mail first.",
        )

    # Validate confidence param
    if confidence.upper() not in ("HIGH", "MEDIUM", "LOW"):
        confidence = "HIGH"
    confidence = confidence.upper()

    # Load all active jobs for matching
    jobs_result = await db.execute(select(Job).where(Job.is_deleted == False))  # noqa: E712
    jobs = [
        {"id": j.id, "title": j.title, "company": j.company}
        for j in jobs_result.scalars().all()
    ]

    # Load existing message IDs to skip duplicates
    existing_gmail = await db.execute(
        select(ApplicationUpdateSuggestion.gmail_message_id)
    )
    existing_yahoo = await db.execute(
        select(ApplicationUpdateSuggestion.yahoo_message_id)
    )
    existing_gmail_ids = {r for r in existing_gmail.scalars().all() if r}
    existing_yahoo_ids = {r for r in existing_yahoo.scalars().all() if r}

    total_fetched = 0
    total_new = 0
    total_skipped = 0

    # Gmail sync
    if gmail_token:
        try:
            emails = await gmail_fetch(gmail_token.access_token, max_results=50, days_back=7)
            total_fetched += len(emails)
            new, skipped = await _process_emails(
                db, emails, jobs, existing_gmail_ids, "gmail_message_id", confidence
            )
            total_new += new
            total_skipped += skipped
        except Exception:
            pass

    # Yahoo sync
    if yahoo_token:
        try:
            emails = await yahoo_fetch(
                yahoo_token.email, yahoo_token.access_token, max_results=50, days_back=7
            )
            total_fetched += len(emails)
            new, skipped = await _process_emails(
                db, emails, jobs, existing_yahoo_ids, "yahoo_message_id", confidence
            )
            total_new += new
            total_skipped += skipped
        except Exception:
            pass

    await db.commit()

    return {
        "emailsFetched": total_fetched,
        "newSuggestions": total_new,
        "skipped": total_skipped,
        "confidenceLevel": confidence,
    }


@router.get("/suggestions", response_model=list[SuggestionResponse])
async def list_suggestions(
    state: str = "pending",
    db: AsyncSession = Depends(get_db),
):
    """List suggestions filtered by state (default: pending)."""
    query = (
        select(ApplicationUpdateSuggestion)
        .where(ApplicationUpdateSuggestion.state == state)
        .order_by(ApplicationUpdateSuggestion.created_at.desc())
    )
    result = await db.execute(query)
    suggestions = result.scalars().all()

    responses = []
    for s in suggestions:
        job_title = None
        job_company = None
        if s.application_id:
            job = await db.get(Job, s.application_id)
            if job:
                job_title = job.title
                job_company = job.company

        resp = SuggestionResponse.model_validate(s)
        resp.application_title = job_title
        resp.application_company = job_company
        responses.append(resp)

    return responses


@router.patch("/suggestions/{suggestion_id}", response_model=SuggestionResponse)
async def update_suggestion(
    suggestion_id: int,
    payload: SuggestionAction,
    db: AsyncSession = Depends(get_db),
):
    """Apply or ignore a suggestion."""
    suggestion = await db.get(ApplicationUpdateSuggestion, suggestion_id)
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    if payload.action == "apply":
        app_id = payload.application_id or suggestion.application_id
        if not app_id:
            raise HTTPException(
                status_code=400,
                detail="No application specified. Choose an application to update.",
            )

        job = await db.get(Job, app_id)
        if not job:
            raise HTTPException(status_code=404, detail="Application not found")
        if job.is_deleted:
            raise HTTPException(status_code=400, detail="Cannot update a deleted application")

        job.status = suggestion.suggested_status
        suggestion.state = "applied"
        suggestion.application_id = app_id

    elif payload.action == "ignore":
        suggestion.state = "ignored"
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'apply' or 'ignore'.")

    await db.commit()
    await db.refresh(suggestion)

    job_title = None
    job_company = None
    if suggestion.application_id:
        job = await db.get(Job, suggestion.application_id)
        if job:
            job_title = job.title
            job_company = job.company

    resp = SuggestionResponse.model_validate(suggestion)
    resp.application_title = job_title
    resp.application_company = job_company
    return resp
