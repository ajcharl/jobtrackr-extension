// Shared helper functions used by multiple route files.

// Converts a database row (snake_case columns) into a camelCase response object.
// The frontend expects camelCase keys like "appliedAt", "createdAt", etc.
function formatJobResponse(row) {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    source: row.source,
    status: row.status,
    appliedAt: row.applied_at,
    url: row.url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
  };
}

function formatSuggestionResponse(row, jobTitle, jobCompany) {
  return {
    id: row.id,
    applicationId: row.application_id,
    detectedType: row.detected_type,
    suggestedStatus: row.suggested_status,
    confidenceScore: row.confidence_score,
    emailSubject: row.email_subject,
    emailSender: row.email_sender,
    emailDate: row.email_date,
    emailSnippet: row.email_snippet,
    gmailMessageId: row.gmail_message_id,
    state: row.state,
    createdAt: row.created_at,
    applicationTitle: jobTitle || null,
    applicationCompany: jobCompany || null,
  };
}

module.exports = {
  formatJobResponse: formatJobResponse,
  formatSuggestionResponse: formatSuggestionResponse,
};
