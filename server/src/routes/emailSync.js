// Email sync routes: run a sync to fetch and process recent Gmail emails,
// list suggestions (pending/applied/ignored), and act on a suggestion.
// All routes require authentication — data is scoped to the logged-in user.

var express = require("express");
var { getPool } = require("../database");
var { formatSuggestionResponse } = require("../helpers");
var gmailService = require("../services/gmailService");
var { processEmail } = require("../services/emailPipeline");
var requireAuth = require("../middleware/auth");

var router = express.Router();

// All email sync routes require a valid login token
router.use(requireAuth);

// Returns the logged-in user's Gmail token, refreshing it if it's about to expire.
// Returns null if the user hasn't connected Gmail.
async function getValidGmailToken(db, userId) {
  var result = await db.query(
    "SELECT * FROM gmail_tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [userId]
  );
  // token is the stored Gmail token row, or undefined if not connected
  var token = result.rows[0];
  if (!token) {
    return null;
  }

  // Check if the token expires within the next 5 minutes
  var fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (token.token_expiry && new Date(token.token_expiry) < fiveMinutesFromNow) {
    try {
      // refreshed contains the new access_token and optionally a new refresh_token
      var refreshed = await gmailService.refreshAccessToken(token.refresh_token);
      var newExpiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000);

      // newRefreshToken is the updated refresh token (sometimes Google rotates them)
      var newRefreshToken = refreshed.refresh_token || token.refresh_token;

      await db.query(
        `UPDATE gmail_tokens
         SET access_token = $1, token_expiry = $2, refresh_token = $3, updated_at = NOW()
         WHERE id = $4`,
        [refreshed.access_token, newExpiry, newRefreshToken, token.id]
      );

      token.access_token = refreshed.access_token;
      token.token_expiry = newExpiry;
    } catch (e) {
      return null;
    }
  }

  return token;
}

// Runs fetched emails through the pipeline and inserts new suggestions for this user.
// Returns an object { newSuggestions, skipped } with counts.
async function processEmails(db, userId, emails, jobs, existingIds, minConfidence) {
  var newSuggestions = 0;
  var skipped = 0;

  for (var i = 0; i < emails.length; i++) {
    var emailData = emails[i];
    // msgId is the unique identifier for this email from Gmail
    var msgId = emailData.id;

    // Skip emails we've already processed
    if (existingIds.has(msgId)) {
      skipped++;
      continue;
    }

    // Run the email through the full pipeline (pre-filter, score, match, classify)
    var pipelineResult = processEmail(emailData, jobs, minConfidence);
    if (pipelineResult === null) {
      continue;
    }

    await db.query(
      `INSERT INTO application_update_suggestions
        (user_id, application_id, detected_type, suggested_status, confidence_score,
         email_subject, email_sender, email_date, email_snippet, gmail_message_id, state)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
      [
        userId,
        pipelineResult.matchedApplicationId,
        pipelineResult.classification,
        pipelineResult.suggestedStatus,
        pipelineResult.confidence,
        pipelineResult.emailSubject,
        pipelineResult.emailSender,
        pipelineResult.emailDate,
        pipelineResult.emailSnippet,
        msgId,
      ]
    );
    newSuggestions++;
  }

  return { newSuggestions: newSuggestions, skipped: skipped };
}

// Fetch recent emails from Gmail, run them through the detection pipeline,
// and create suggestions for the logged-in user
router.post("/run", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;

    // confidence is the minimum confidence level from the query string
    var confidence = (req.query.confidence || "HIGH").toUpperCase();
    if (confidence !== "HIGH" && confidence !== "MEDIUM" && confidence !== "LOW") {
      confidence = "HIGH";
    }

    var gmailToken = await getValidGmailToken(db, userId);

    if (!gmailToken) {
      res.status(400).json({
        detail: "Gmail is not connected. Please connect Gmail first.",
      });
      return;
    }

    // Load this user's active (non-deleted) jobs for matching
    var jobsResult = await db.query(
      "SELECT id, title, company FROM jobs WHERE user_id = $1 AND is_deleted = false",
      [userId]
    );
    var jobs = jobsResult.rows;

    // Load existing Gmail message IDs for this user so we can skip duplicates
    var existingResult = await db.query(
      "SELECT gmail_message_id FROM application_update_suggestions WHERE user_id = $1 AND gmail_message_id IS NOT NULL",
      [userId]
    );

    // existingIds is a Set of Gmail message IDs we've already processed for this user
    var existingIds = new Set(
      existingResult.rows.map(function (r) { return r.gmail_message_id; })
    );

    var totalFetched = 0;
    var totalNew = 0;
    var totalSkipped = 0;

    // Fetch and process Gmail emails
    try {
      var emails = await gmailService.fetchRecentEmails(gmailToken.access_token, 50, 7);
      totalFetched = emails.length;

      var results = await processEmails(db, userId, emails, jobs, existingIds, confidence);
      totalNew = results.newSuggestions;
      totalSkipped = results.skipped;
    } catch (e) {
      // silently continue if Gmail fetch fails
    }

    res.json({
      emailsFetched: totalFetched,
      newSuggestions: totalNew,
      skipped: totalSkipped,
      confidenceLevel: confidence,
    });
  } catch (err) {
    next(err);
  }
});

// List suggestions for the logged-in user, filtered by state (default: "pending")
router.get("/suggestions", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;
    // state is the filter — "pending", "applied", or "ignored"
    var state = req.query.state || "pending";

    var result = await db.query(
      "SELECT * FROM application_update_suggestions WHERE user_id = $1 AND state = $2 ORDER BY created_at DESC",
      [userId, state]
    );

    var suggestions = result.rows;
    var responses = [];

    // For each suggestion, look up the matched job to include its title and company
    for (var i = 0; i < suggestions.length; i++) {
      var s = suggestions[i];
      var jobTitle = null;
      var jobCompany = null;

      if (s.application_id) {
        var jobResult = await db.query(
          "SELECT title, company FROM jobs WHERE id = $1 AND user_id = $2",
          [s.application_id, userId]
        );
        // matchedJob is the job record this suggestion refers to, if it still exists
        var matchedJob = jobResult.rows[0];
        if (matchedJob) {
          jobTitle = matchedJob.title;
          jobCompany = matchedJob.company;
        }
      }

      responses.push(formatSuggestionResponse(s, jobTitle, jobCompany));
    }

    res.json(responses);
  } catch (err) {
    next(err);
  }
});

// Apply or ignore a suggestion for the logged-in user.
// If "apply", it updates the matched job's status to the suggested one.
// If "ignore", it just marks the suggestion as ignored.
router.patch("/suggestions/:suggestionId", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;
    // suggestionId is the ID from the URL path
    var suggestionId = parseInt(req.params.suggestionId, 10);

    var result = await db.query(
      "SELECT * FROM application_update_suggestions WHERE id = $1 AND user_id = $2",
      [suggestionId, userId]
    );
    var suggestion = result.rows[0];

    if (!suggestion) {
      res.status(404).json({ detail: "Suggestion not found" });
      return;
    }

    // action is either "apply" or "ignore", sent in the request body
    var action = req.body.action;
    // applicationId can be sent to override which job to update
    var applicationId = req.body.applicationId || req.body.application_id;

    if (action === "apply") {
      // appId is the ID of the job to update — either from the request or from the suggestion
      var appId = applicationId || suggestion.application_id;

      if (!appId) {
        res.status(400).json({
          detail: "No application specified. Choose an application to update.",
        });
        return;
      }

      var jobResult = await db.query(
        "SELECT * FROM jobs WHERE id = $1 AND user_id = $2",
        [appId, userId]
      );
      var job = jobResult.rows[0];

      if (!job) {
        res.status(404).json({ detail: "Application not found" });
        return;
      }
      if (job.is_deleted) {
        res.status(400).json({ detail: "Cannot update a deleted application" });
        return;
      }

      // Update the job's status to what the suggestion recommends
      await db.query(
        "UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3",
        [suggestion.suggested_status, appId, userId]
      );

      // Mark the suggestion as applied and link it to the job
      await db.query(
        "UPDATE application_update_suggestions SET state = 'applied', application_id = $1 WHERE id = $2 AND user_id = $3",
        [appId, suggestionId, userId]
      );

      suggestion.state = "applied";
      suggestion.application_id = appId;

    } else if (action === "ignore") {
      await db.query(
        "UPDATE application_update_suggestions SET state = 'ignored' WHERE id = $1 AND user_id = $2",
        [suggestionId, userId]
      );
      suggestion.state = "ignored";

    } else {
      res.status(400).json({ detail: "Invalid action. Use 'apply' or 'ignore'." });
      return;
    }

    // Look up the matched job to include in the response
    var jobTitle = null;
    var jobCompany = null;

    if (suggestion.application_id) {
      var jobLookup = await db.query(
        "SELECT title, company FROM jobs WHERE id = $1 AND user_id = $2",
        [suggestion.application_id, userId]
      );
      var matchedJob = jobLookup.rows[0];
      if (matchedJob) {
        jobTitle = matchedJob.title;
        jobCompany = matchedJob.company;
      }
    }

    res.json(formatSuggestionResponse(suggestion, jobTitle, jobCompany));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
