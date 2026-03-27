"""
High-precision email processing pipeline for detecting job application updates.

Pipeline stages:
  1. pre_filter()     — discard obvious noise early
  2. score_email()    — assign 0–100 confidence based on signals
  3. match_application() — match to a tracked application
  4. classify_email() — determine update type
  5. process_email()  — orchestrate the full pipeline
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# ─── Constants / Config ──────────────────────────────────────────────────────

# Known ATS / recruiting platform domains (used in sender filtering + scoring)
ATS_DOMAINS = frozenset({
    "workday.com", "myworkdayjobs.com", "greenhouse.io", "lever.co",
    "ashbyhq.com", "smartrecruiters.com", "icims.com", "jobvite.com",
    "jazz.co", "bamboohr.com", "taleo.net", "breezy.hr", "recruitee.com",
})

# Sender patterns that indicate a recruiting/HR email
RECRUITING_SENDER_PATTERNS = frozenset({
    "no-reply", "noreply", "careers", "recruiting", "jobs", "talent",
    "hr@", "hiring", "recruit", "apply", "applicant",
})

# Subject must contain at least one of these to pass the pre-filter
SUBJECT_SIGNALS = frozenset({
    "application", "interview", "update", "thank you for applying",
    "your application", "next steps", "offer", "assessment",
    "coding challenge", "phone screen", "schedule", "candidacy",
    "unfortunately", "regret", "moving forward",
})

# If subject OR body contains any of these → discard
EXCLUSION_KEYWORDS = frozenset({
    "newsletter", "promotion", "webinar", "event invitation",
    "sale", "unsubscribe", "marketing", "subscription",
    "black friday", "cyber monday", "limited time", "discount",
    "we miss you", "check out our", "new blog post",
})

# Confidence thresholds
CONFIDENCE_HIGH = 80
CONFIDENCE_MEDIUM = 50


# ─── Data structures ─────────────────────────────────────────────────────────

@dataclass
class EmailResult:
    """Structured output of the pipeline."""
    email_id: str
    classification: str          # INTERVIEW_INVITE, REJECTION, etc.
    confidence: int              # 0–100
    confidence_level: str        # HIGH, MEDIUM, LOW
    matched_application_id: int | None
    matched_company: str | None
    matched_role: str | None
    suggested_status: str
    summary: str                 # human-readable
    email_subject: str
    email_sender: str
    email_date: object
    email_snippet: str


# ─── Classification rules ────────────────────────────────────────────────────

CLASSIFICATION_RULES: list[tuple[str, str, list[str]]] = [
    # (type, suggested_status, keyword phrases)
    ("INTERVIEW_INVITE", "Interview", [
        "schedule an interview",
        "interview invitation",
        "like to invite you",
        "phone screen",
        "book a time",
        "schedule a call",
        "availability for interview",
        "interview with",
        "virtual interview",
        "on-site interview",
        "video interview",
        "technical interview",
        "meet the team",
    ]),
    ("ASSESSMENT", "Interview", [
        "coding challenge",
        "take-home",
        "take home",
        "technical assessment",
        "online assessment",
        "hackerrank",
        "codility",
        "codesignal",
        "technical exercise",
    ]),
    ("REJECTION", "Rejected", [
        "unfortunately",
        "not moving forward",
        "decided to proceed with other candidates",
        "will not be moving forward",
        "position has been filled",
        "not able to offer you",
        "regret to inform",
        "other candidates whose experience",
        "not selected",
        "after careful consideration",
        "we will not be proceeding",
        "unable to move forward",
    ]),
    ("OFFER", "Offer", [
        "pleased to offer",
        "offer letter",
        "excited to extend",
        "formal offer",
        "compensation package",
        "we'd like to offer",
        "extend an offer",
    ]),
    ("APPLICATION_CONFIRMATION", "Applied", [
        "thank you for applying",
        "application received",
        "we received your application",
        "application has been submitted",
        "successfully applied",
        "thanks for your interest",
        "application is under review",
    ]),
    ("STATUS_UPDATE", "Applied", [
        "update on your application",
        "application status",
        "your candidacy",
        "next steps",
        "moved to the next stage",
    ]),
]

TYPE_TO_STATUS = {rule[0]: rule[1] for rule in CLASSIFICATION_RULES}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().strip())


def _extract_domain(sender: str) -> str:
    match = re.search(r"@([\w.-]+)", sender)
    return match.group(1).lower() if match else ""


# ─── Stage 1: Pre-filter ─────────────────────────────────────────────────────

def pre_filter(subject: str, body: str, sender: str) -> bool:
    """
    Return True if the email should be processed, False to discard.

    Must pass:
      - sender matches a recruiting pattern OR ATS domain
      - subject contains at least one job-related signal
      - no exclusion keywords in subject or body
    """
    lower_subject = subject.lower()
    lower_body = body.lower() if body else ""
    lower_sender = sender.lower()
    sender_domain = _extract_domain(sender)

    # Check exclusions first (fast rejection)
    combined = f"{lower_subject} {lower_body[:2000]}"
    for excl in EXCLUSION_KEYWORDS:
        if excl in combined:
            return False

    # Sender check: must match ATS domain OR recruiting pattern
    sender_ok = False
    for ats in ATS_DOMAINS:
        if ats in sender_domain:
            sender_ok = True
            break
    if not sender_ok:
        for pattern in RECRUITING_SENDER_PATTERNS:
            if pattern in lower_sender:
                sender_ok = True
                break
    if not sender_ok:
        return False

    # Subject check: must contain at least one signal
    for signal in SUBJECT_SIGNALS:
        if signal in lower_subject:
            return True

    return False


# ─── Stage 2: Confidence scoring ─────────────────────────────────────────────

def score_email(
    subject: str,
    body: str,
    sender: str,
    tracked_companies: list[str] | None = None,
) -> int:
    """
    Assign a confidence score (0–100) based on positive, contextual,
    and negative signals.
    """
    score = 0
    lower_subject = subject.lower()
    lower_body = (body or "").lower()
    combined = f"{lower_subject} {lower_body[:3000]}"
    sender_domain = _extract_domain(sender)

    # ── Positive signals ──

    # Sender is a known ATS platform → +40
    for ats in ATS_DOMAINS:
        if ats in sender_domain:
            score += 40
            break

    # Subject contains "application" → +25
    if "application" in lower_subject:
        score += 25

    # Subject contains "interview" → +30
    if "interview" in lower_subject:
        score += 30

    # Body contains interview keywords → +30 (only once)
    interview_body_kw = ["schedule", "availability", "time slot", "calendar", "meet"]
    if any(kw in combined for kw in interview_body_kw):
        score += 30

    # Body contains rejection keywords → +30
    rejection_kw = ["unfortunately", "not moving forward", "regret to inform",
                    "will not be proceeding", "decided to proceed with other"]
    if any(kw in combined for kw in rejection_kw):
        score += 30

    # Body contains confirmation phrases → +20
    confirm_kw = ["thank you for applying", "application received",
                  "we received your application"]
    if any(kw in combined for kw in confirm_kw):
        score += 20

    # ── Contextual signals ──

    # Email mentions a tracked company name → +25
    if tracked_companies:
        for company in tracked_companies:
            if company and company.lower() in combined:
                score += 25
                break

    # Contains role-related keywords → +15
    role_kw = ["position", "role", "opening", "opportunity", "candidate"]
    if any(kw in combined for kw in role_kw):
        score += 15

    # ── Negative signals ──

    if "unsubscribe" in combined:
        score -= 20

    promo_kw = ["limited time", "discount", "special offer", "free trial"]
    if any(kw in combined for kw in promo_kw):
        score -= 20

    return max(0, min(100, score))


def confidence_level(score: int) -> str:
    if score >= CONFIDENCE_HIGH:
        return "HIGH"
    if score >= CONFIDENCE_MEDIUM:
        return "MEDIUM"
    return "LOW"


# ─── Stage 3: Match against tracked applications ─────────────────────────────

def match_application(
    jobs: list[dict],
    subject: str,
    body: str,
    sender: str,
) -> tuple[dict | None, int]:
    """
    Find the best-matching tracked application.

    Scoring (per application):
      +5  company name in email text
      +5  job title in email text
      +3  sender domain contains company name
      +2  sender is a known ATS platform

    Returns (best_job, match_score) or (None, 0).
    """
    text = _normalize(f"{subject} {body}")
    sender_domain = _extract_domain(sender)

    best_job = None
    best_score = 0

    for job in jobs:
        s = 0
        company = _normalize(job.get("company", ""))
        title = _normalize(job.get("title", ""))

        if company and company in text:
            s += 5
        if title and title in text:
            s += 5
        if company and company.replace(" ", "") in sender_domain.replace(".", ""):
            s += 3
        for ats in ATS_DOMAINS:
            if ats in sender_domain:
                s += 2
                break

        if s > best_score:
            best_score = s
            best_job = job

    # Require at least 6 to count as a match
    if best_score >= 6:
        return best_job, best_score
    return None, 0


# ─── Stage 4: Classify email type ────────────────────────────────────────────

def classify_email(subject: str, body: str) -> tuple[str, str]:
    """
    Classify into one of the defined types using keyword rules.
    Returns (classification, suggested_status).
    Falls back to ("OTHER", "Applied").
    """
    combined = f"{subject} {body}".lower()

    for email_type, status, keywords in CLASSIFICATION_RULES:
        for kw in keywords:
            if kw in combined:
                return email_type, status

    return "OTHER", "Applied"


# ─── Stage 5: Full pipeline orchestrator ──────────────────────────────────────

def _build_summary(classification: str, company: str | None, role: str | None) -> str:
    """Build a human-readable summary line."""
    action_map = {
        "INTERVIEW_INVITE": "Interview invitation",
        "ASSESSMENT": "Assessment / coding challenge",
        "REJECTION": "Application rejected",
        "OFFER": "Job offer received",
        "APPLICATION_CONFIRMATION": "Application confirmed",
        "STATUS_UPDATE": "Application status update",
        "OTHER": "Job-related update",
    }
    label = action_map.get(classification, "Update")
    if company and role:
        return f"{label} — {role} at {company}"
    if company:
        return f"{label} — {company}"
    return label


def _suggested_action(classification: str) -> str:
    actions = {
        "INTERVIEW_INVITE": "Move to Interview stage",
        "ASSESSMENT": "Move to Interview stage",
        "REJECTION": "Mark as Rejected",
        "OFFER": "Mark as Offer",
        "APPLICATION_CONFIRMATION": "Confirm as Applied",
        "STATUS_UPDATE": "Review status update",
        "OTHER": "Review update",
    }
    return actions.get(classification, "Review")


def process_email(
    email: dict,
    jobs: list[dict],
    min_confidence: str = "HIGH",
) -> EmailResult | None:
    """
    Run a single email through the full pipeline.

    Args:
        email: dict with id, subject, body, sender, date, snippet
        jobs: tracked applications [{"id", "title", "company"}, ...]
        min_confidence: "HIGH" (default), "MEDIUM", or "LOW"

    Returns:
        EmailResult if it passes all stages, None otherwise.
    """
    subject = email.get("subject", "")
    body = email.get("body", "")
    sender = email.get("sender", "")

    # Stage 1: Pre-filter
    if not pre_filter(subject, body, sender):
        return None

    # Stage 2: Score
    tracked_companies = [j.get("company", "") for j in jobs]
    conf = score_email(subject, body, sender, tracked_companies)
    level = confidence_level(conf)

    # Apply minimum confidence threshold
    thresholds = {"HIGH": CONFIDENCE_HIGH, "MEDIUM": CONFIDENCE_MEDIUM, "LOW": 0}
    if conf < thresholds.get(min_confidence, CONFIDENCE_HIGH):
        return None

    # Stage 3: Match
    matched_job, _match_score = match_application(jobs, subject, body, sender)

    # Stage 4: Classify
    classification, suggested_status = classify_email(subject, body)

    # Build result
    company = matched_job["company"] if matched_job else None
    role = matched_job["title"] if matched_job else None
    summary = _build_summary(classification, company, role)

    return EmailResult(
        email_id=email["id"],
        classification=classification,
        confidence=conf,
        confidence_level=level,
        matched_application_id=matched_job["id"] if matched_job else None,
        matched_company=company,
        matched_role=role,
        suggested_status=suggested_status,
        summary=summary,
        email_subject=subject,
        email_sender=sender,
        email_date=email.get("date"),
        email_snippet=(email.get("snippet") or "")[:500],
    )
