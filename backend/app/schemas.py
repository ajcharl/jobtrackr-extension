from datetime import datetime

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class JobCreate(BaseModel):
    title: str
    company: str
    source: str = ""
    status: str = "Applied"
    applied_at: datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("applied_at", "appliedAt"),
    )
    url: str | None = None
    notes: str | None = None


class JobUpdate(BaseModel):
    title: str | None = None
    company: str | None = None
    source: str | None = None
    status: str | None = None
    url: str | None = None
    notes: str | None = None


class JobResponse(BaseModel):
    id: int
    title: str
    company: str
    source: str
    status: str
    applied_at: datetime | None = Field(alias="applied_at", serialization_alias="appliedAt")
    url: str | None
    notes: str | None
    created_at: datetime = Field(alias="created_at", serialization_alias="createdAt")
    updated_at: datetime = Field(alias="updated_at", serialization_alias="updatedAt")
    is_deleted: bool = Field(alias="is_deleted", serialization_alias="isDeleted", default=False)
    deleted_at: datetime | None = Field(
        alias="deleted_at", serialization_alias="deletedAt", default=None
    )

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ── Email Sync Schemas ──────────────────────────────────────────────────────

class SuggestionResponse(BaseModel):
    id: int
    application_id: int | None = Field(
        alias="application_id", serialization_alias="applicationId"
    )
    detected_type: str = Field(
        alias="detected_type", serialization_alias="detectedType"
    )
    suggested_status: str = Field(
        alias="suggested_status", serialization_alias="suggestedStatus"
    )
    confidence_score: float = Field(
        alias="confidence_score", serialization_alias="confidenceScore"
    )
    email_subject: str | None = Field(
        alias="email_subject", serialization_alias="emailSubject"
    )
    email_sender: str | None = Field(
        alias="email_sender", serialization_alias="emailSender"
    )
    email_date: datetime | None = Field(
        alias="email_date", serialization_alias="emailDate"
    )
    email_snippet: str | None = Field(
        alias="email_snippet", serialization_alias="emailSnippet"
    )
    gmail_message_id: str | None = Field(
        alias="gmail_message_id", serialization_alias="gmailMessageId"
    )
    state: str
    created_at: datetime = Field(alias="created_at", serialization_alias="createdAt")

    # Include matched job info for the frontend
    application_title: str | None = Field(default=None, serialization_alias="applicationTitle")
    application_company: str | None = Field(default=None, serialization_alias="applicationCompany")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SuggestionAction(BaseModel):
    """For applying or ignoring a suggestion."""
    action: str  # "apply" | "ignore"
    application_id: int | None = Field(
        default=None,
        validation_alias=AliasChoices("application_id", "applicationId"),
    )


class GmailStatusResponse(BaseModel):
    connected: bool
    email: str | None = None


class YahooStatusResponse(BaseModel):
    connected: bool
    email: str | None = None
