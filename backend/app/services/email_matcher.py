"""
Match job-related emails to tracked applications using simple scoring.
"""

import re

# Known ATS / job platform domains
JOB_PLATFORM_DOMAINS = [
    "greenhouse.io",
    "lever.co",
    "workday.com",
    "icims.com",
    "smartrecruiters.com",
    "jobvite.com",
    "ashbyhq.com",
    "jazz.co",
    "bamboohr.com",
    "myworkdayjobs.com",
    "taleo.net",
    "breezy.hr",
    "recruitee.com",
]

# Minimum score to consider a match
MATCH_THRESHOLD = 6


def _normalize(text: str) -> str:
    """Lowercase and strip extra whitespace."""
    return re.sub(r"\s+", " ", text.lower().strip())


def _extract_domain(sender: str) -> str:
    """Extract domain from an email address like 'Name <user@example.com>'."""
    match = re.search(r"@([\w.-]+)", sender)
    return match.group(1).lower() if match else ""


def score_match(
    job_title: str,
    job_company: str,
    email_subject: str,
    email_body: str,
    email_sender: str,
) -> int:
    """
    Score how well an email matches a tracked job application.

    Scoring:
        +5  company name appears in email subject or body
        +5  role/job title appears in email subject or body
        +3  sender domain contains the company name
        +2  email involves a known job platform (greenhouse, lever, etc.)

    Returns:
        Integer score. Higher = stronger match.
    """
    score = 0
    email_text = _normalize(f"{email_subject} {email_body}")
    company = _normalize(job_company)
    title = _normalize(job_title)
    sender_domain = _extract_domain(email_sender)

    # +5 company name in email
    if company and company in email_text:
        score += 5

    # +5 job title in email
    if title and title in email_text:
        score += 5

    # +3 sender domain contains company name
    if company and company.replace(" ", "") in sender_domain.replace(".", ""):
        score += 3

    # +2 known job platform reference
    for platform in JOB_PLATFORM_DOMAINS:
        if platform in email_text or platform in sender_domain:
            score += 2
            break  # Only count once

    return score


def find_best_match(
    jobs: list[dict],
    email_subject: str,
    email_body: str,
    email_sender: str,
) -> tuple[dict | None, int]:
    """
    Find the best-matching job application for an email.

    Args:
        jobs: List of dicts with at least 'id', 'title', 'company'.
        email_subject: Email subject line.
        email_body: Email body text.
        email_sender: Sender address.

    Returns:
        (best_matching_job, score) or (None, 0) if no match meets threshold.
    """
    best_job = None
    best_score = 0

    for job in jobs:
        s = score_match(
            job_title=job["title"],
            job_company=job["company"],
            email_subject=email_subject,
            email_body=email_body,
            email_sender=email_sender,
        )
        if s > best_score:
            best_score = s
            best_job = job

    if best_score >= MATCH_THRESHOLD:
        return best_job, best_score

    return None, 0
