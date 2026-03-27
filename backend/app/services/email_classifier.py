"""
Keyword-based email classification for job-related emails.
Detects email type and maps to suggested application status.
"""

# ── Detection rules: keyword → (detected_type, suggested_status) ──────────

CLASSIFICATION_RULES: list[tuple[str, list[str]]] = [
    # (detected_type, keywords)
    ("application_confirmation", [
        "thank you for applying",
        "application received",
        "we received your application",
        "thanks for your interest",
        "application has been submitted",
        "successfully applied",
    ]),
    ("interview_invitation", [
        "schedule an interview",
        "interview invitation",
        "availability for interview",
        "like to invite you",
        "phone screen",
        "interview with",
        "book a time",
        "calendly",
        "schedule a call",
    ]),
    ("assessment", [
        "coding challenge",
        "assessment",
        "take home",
        "technical exercise",
        "online test",
        "hackerrank",
        "codility",
        "codesignal",
    ]),
    ("rejection", [
        "unfortunately",
        "not moving forward",
        "decided to proceed with other candidates",
        "will not be moving forward",
        "position has been filled",
        "not able to offer",
        "regret to inform",
        "other candidates whose experience",
        "not selected",
    ]),
    ("offer", [
        "pleased to offer",
        "offer letter",
        "excited to extend",
        "formal offer",
        "compensation package",
        "we'd like to offer",
        "congratulations",
    ]),
]

# Map detected_type → suggested application status
TYPE_TO_STATUS: dict[str, str] = {
    "application_confirmation": "Applied",
    "interview_invitation": "Interview",
    "assessment": "Interview",
    "rejection": "Rejected",
    "offer": "Offer",
}


def classify_email(subject: str, body: str) -> tuple[str | None, str | None]:
    """
    Classify an email by scanning subject and body for keywords.

    Returns:
        (detected_type, suggested_status) or (None, None) if no match.
    """
    text = f"{subject} {body}".lower()

    for detected_type, keywords in CLASSIFICATION_RULES:
        for keyword in keywords:
            if keyword in text:
                return detected_type, TYPE_TO_STATUS[detected_type]

    return None, None
