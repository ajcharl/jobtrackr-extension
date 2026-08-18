// High-precision email processing pipeline for detecting job application updates.
//
// Pipeline stages:
//   1. preFilter()         — discard obvious noise early
//   2. scoreEmail()        — assign 0-100 confidence based on signals
//   3. matchApplication()  — match to a tracked application
//   4. classifyEmail()     — determine update type
//   5. processEmail()      — orchestrate the full pipeline

// Known ATS (Applicant Tracking System) / recruiting platform domains
var ATS_DOMAINS = [
  "workday.com", "myworkdayjobs.com", "greenhouse.io", "lever.co",
  "ashbyhq.com", "smartrecruiters.com", "icims.com", "jobvite.com",
  "jazz.co", "bamboohr.com", "taleo.net", "breezy.hr", "recruitee.com",
];

// Sender patterns that suggest a recruiting or HR email
var RECRUITING_SENDER_PATTERNS = [
  "no-reply", "noreply", "careers", "recruiting", "jobs", "talent",
  "hr@", "hiring", "recruit", "apply", "applicant",
];

// The email subject must contain at least one of these to pass the pre-filter
var SUBJECT_SIGNALS = [
  "application", "interview", "update", "thank you for applying",
  "your application", "next steps", "offer", "assessment",
  "coding challenge", "phone screen", "schedule", "candidacy",
  "unfortunately", "regret", "moving forward",
];

// If subject OR body contains any of these, discard the email as noise
var EXCLUSION_KEYWORDS = [
  "newsletter", "promotion", "webinar", "event invitation",
  "sale", "unsubscribe", "marketing", "subscription",
  "black friday", "cyber monday", "limited time", "discount",
  "we miss you", "check out our", "new blog post",
];

// Confidence thresholds — scores at or above these are categorized
var CONFIDENCE_HIGH = 80;
var CONFIDENCE_MEDIUM = 50;

// Classification rules: each entry is [type, suggestedStatus, [keyword phrases]]
var CLASSIFICATION_RULES = [
  ["INTERVIEW_INVITE", "Interview", [
    "schedule an interview", "interview invitation", "like to invite you",
    "phone screen", "book a time", "schedule a call",
    "availability for interview", "interview with", "virtual interview",
    "on-site interview", "video interview", "technical interview", "meet the team",
  ]],
  ["ASSESSMENT", "Interview", [
    "coding challenge", "take-home", "take home", "technical assessment",
    "online assessment", "hackerrank", "codility", "codesignal", "technical exercise",
  ]],
  ["REJECTION", "Rejected", [
    "unfortunately", "not moving forward", "decided to proceed with other candidates",
    "will not be moving forward", "position has been filled", "not able to offer you",
    "regret to inform", "other candidates whose experience", "not selected",
    "after careful consideration", "we will not be proceeding", "unable to move forward",
  ]],
  ["OFFER", "Offer", [
    "pleased to offer", "offer letter", "excited to extend", "formal offer",
    "compensation package", "we'd like to offer", "extend an offer",
  ]],
  ["APPLICATION_CONFIRMATION", "Applied", [
    "thank you for applying", "application received", "we received your application",
    "application has been submitted", "successfully applied",
    "thanks for your interest", "application is under review",
  ]],
  ["STATUS_UPDATE", "Applied", [
    "update on your application", "application status", "your candidacy",
    "next steps", "moved to the next stage",
  ]],
];

// --- Helper functions ---

// Collapses whitespace and lowercases the text for consistent comparison
function normalize(text) {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

// Extracts the domain from an email address like "Name <user@example.com>"
function extractDomain(sender) {
  var match = sender.match(/@([\w.-]+)/);
  if (match) {
    return match[1].toLowerCase();
  }
  return "";
}

// Returns "HIGH", "MEDIUM", or "LOW" based on the numeric score
function confidenceLevel(score) {
  if (score >= CONFIDENCE_HIGH) {
    return "HIGH";
  }
  if (score >= CONFIDENCE_MEDIUM) {
    return "MEDIUM";
  }
  return "LOW";
}

// --- Stage 1: Pre-filter ---

// Returns true if the email should be processed, false to discard it.
// Must pass: sender is from ATS or recruiting pattern, subject has a job signal, no spam keywords.
function preFilter(subject, body, sender) {
  var lowerSubject = subject.toLowerCase();
  var lowerBody = body ? body.toLowerCase() : "";
  var lowerSender = sender.toLowerCase();
  var senderDomain = extractDomain(sender);

  // Check exclusion keywords first (fast rejection)
  var combined = lowerSubject + " " + lowerBody.substring(0, 2000);
  for (var i = 0; i < EXCLUSION_KEYWORDS.length; i++) {
    if (combined.indexOf(EXCLUSION_KEYWORDS[i]) !== -1) {
      return false;
    }
  }

  // Sender check: must match an ATS domain OR a recruiting pattern
  var senderOk = false;
  for (var i = 0; i < ATS_DOMAINS.length; i++) {
    if (senderDomain.indexOf(ATS_DOMAINS[i]) !== -1) {
      senderOk = true;
      break;
    }
  }
  if (!senderOk) {
    for (var i = 0; i < RECRUITING_SENDER_PATTERNS.length; i++) {
      if (lowerSender.indexOf(RECRUITING_SENDER_PATTERNS[i]) !== -1) {
        senderOk = true;
        break;
      }
    }
  }
  if (!senderOk) {
    return false;
  }

  // Subject check: must contain at least one job-related signal
  for (var i = 0; i < SUBJECT_SIGNALS.length; i++) {
    if (lowerSubject.indexOf(SUBJECT_SIGNALS[i]) !== -1) {
      return true;
    }
  }

  return false;
}

// --- Stage 2: Confidence scoring ---

// Assigns a confidence score from 0 to 100 based on positive, contextual, and negative signals
function scoreEmail(subject, body, sender, trackedCompanies) {
  var score = 0;
  var lowerSubject = subject.toLowerCase();
  var lowerBody = body ? body.toLowerCase() : "";
  var combined = lowerSubject + " " + lowerBody.substring(0, 3000);
  var senderDomain = extractDomain(sender);

  // Positive: sender is a known ATS platform (+40)
  for (var i = 0; i < ATS_DOMAINS.length; i++) {
    if (senderDomain.indexOf(ATS_DOMAINS[i]) !== -1) {
      score = score + 40;
      break;
    }
  }

  // Positive: subject contains "application" (+25)
  if (lowerSubject.indexOf("application") !== -1) {
    score = score + 25;
  }

  // Positive: subject contains "interview" (+30)
  if (lowerSubject.indexOf("interview") !== -1) {
    score = score + 30;
  }

  // Positive: body contains interview-related keywords (+30)
  var interviewBodyKw = ["schedule", "availability", "time slot", "calendar", "meet"];
  for (var i = 0; i < interviewBodyKw.length; i++) {
    if (combined.indexOf(interviewBodyKw[i]) !== -1) {
      score = score + 30;
      break;
    }
  }

  // Positive: body contains rejection keywords (+30)
  var rejectionKw = ["unfortunately", "not moving forward", "regret to inform",
    "will not be proceeding", "decided to proceed with other"];
  for (var i = 0; i < rejectionKw.length; i++) {
    if (combined.indexOf(rejectionKw[i]) !== -1) {
      score = score + 30;
      break;
    }
  }

  // Positive: body contains confirmation phrases (+20)
  var confirmKw = ["thank you for applying", "application received",
    "we received your application"];
  for (var i = 0; i < confirmKw.length; i++) {
    if (combined.indexOf(confirmKw[i]) !== -1) {
      score = score + 20;
      break;
    }
  }

  // Contextual: email mentions a tracked company name (+25)
  if (trackedCompanies && trackedCompanies.length > 0) {
    for (var i = 0; i < trackedCompanies.length; i++) {
      if (trackedCompanies[i] && combined.indexOf(trackedCompanies[i].toLowerCase()) !== -1) {
        score = score + 25;
        break;
      }
    }
  }

  // Contextual: contains role-related keywords (+15)
  var roleKw = ["position", "role", "opening", "opportunity", "candidate"];
  for (var i = 0; i < roleKw.length; i++) {
    if (combined.indexOf(roleKw[i]) !== -1) {
      score = score + 15;
      break;
    }
  }

  // Negative: "unsubscribe" suggests it might be a marketing email (-20)
  if (combined.indexOf("unsubscribe") !== -1) {
    score = score - 20;
  }

  // Negative: promotional language (-20)
  var promoKw = ["limited time", "discount", "special offer", "free trial"];
  for (var i = 0; i < promoKw.length; i++) {
    if (combined.indexOf(promoKw[i]) !== -1) {
      score = score - 20;
      break;
    }
  }

  // Clamp the score between 0 and 100
  if (score < 0) {
    score = 0;
  }
  if (score > 100) {
    score = 100;
  }

  return score;
}

// --- Stage 3: Match against tracked applications ---

// Finds the best-matching tracked job application for this email.
// Returns an object { job, score } where job is the matched job or null.
function matchApplication(jobs, subject, body, sender) {
  var text = normalize(subject + " " + body);
  var senderDomain = extractDomain(sender);

  var bestJob = null;
  var bestScore = 0;

  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    var s = 0;
    var company = normalize(job.company || "");
    var title = normalize(job.title || "");

    // +5 if the company name appears in the email
    if (company && text.indexOf(company) !== -1) {
      s = s + 5;
    }
    // +5 if the job title appears in the email
    if (title && text.indexOf(title) !== -1) {
      s = s + 5;
    }
    // +3 if the sender domain contains the company name
    if (company && senderDomain.replace(/\./g, "").indexOf(company.replace(/ /g, "")) !== -1) {
      s = s + 3;
    }
    // +2 if the sender is a known ATS platform
    for (var j = 0; j < ATS_DOMAINS.length; j++) {
      if (senderDomain.indexOf(ATS_DOMAINS[j]) !== -1) {
        s = s + 2;
        break;
      }
    }

    if (s > bestScore) {
      bestScore = s;
      bestJob = job;
    }
  }

  // Require a minimum score of 6 to count as a match
  if (bestScore >= 6) {
    return { job: bestJob, score: bestScore };
  }
  return { job: null, score: 0 };
}

// --- Stage 4: Classify email type ---

// Determines what type of job email this is (interview invite, rejection, etc.)
// Returns an object { classification, suggestedStatus }
function classifyEmail(subject, body) {
  var combined = (subject + " " + body).toLowerCase();

  for (var i = 0; i < CLASSIFICATION_RULES.length; i++) {
    // rule is [emailType, suggestedStatus, [keywords]]
    var rule = CLASSIFICATION_RULES[i];
    var emailType = rule[0];
    var status = rule[1];
    var keywords = rule[2];

    for (var j = 0; j < keywords.length; j++) {
      if (combined.indexOf(keywords[j]) !== -1) {
        return { classification: emailType, suggestedStatus: status };
      }
    }
  }

  return { classification: "OTHER", suggestedStatus: "Applied" };
}

// --- Stage 5: Full pipeline orchestrator ---

// Builds a human-readable summary line for the suggestion
function buildSummary(classification, company, role) {
  var actionMap = {
    INTERVIEW_INVITE: "Interview invitation",
    ASSESSMENT: "Assessment / coding challenge",
    REJECTION: "Application rejected",
    OFFER: "Job offer received",
    APPLICATION_CONFIRMATION: "Application confirmed",
    STATUS_UPDATE: "Application status update",
    OTHER: "Job-related update",
  };

  var label = actionMap[classification] || "Update";

  if (company && role) {
    return label + " — " + role + " at " + company;
  }
  if (company) {
    return label + " — " + company;
  }
  return label;
}

// Runs a single email through the full pipeline (all 5 stages).
// Returns a result object if the email passes all stages, or null if it's filtered out.
function processEmail(emailData, jobs, minConfidence) {
  if (minConfidence === undefined) {
    minConfidence = "HIGH";
  }

  // Pull out the fields we need from the email data
  var subject = emailData.subject || "";
  var body = emailData.body || "";
  var sender = emailData.sender || "";

  // Stage 1: Pre-filter — discard noise
  if (!preFilter(subject, body, sender)) {
    return null;
  }

  // Stage 2: Score — assign confidence
  // trackedCompanies is the array of company names from the user's tracked jobs
  var trackedCompanies = jobs.map(function (j) { return j.company || ""; });
  var conf = scoreEmail(subject, body, sender, trackedCompanies);
  var level = confidenceLevel(conf);

  // Apply the minimum confidence threshold
  var thresholds = { HIGH: CONFIDENCE_HIGH, MEDIUM: CONFIDENCE_MEDIUM, LOW: 0 };
  var threshold = thresholds[minConfidence];
  if (threshold === undefined) {
    threshold = CONFIDENCE_HIGH;
  }
  if (conf < threshold) {
    return null;
  }

  // Stage 3: Match — find which tracked job this email is about
  var matchResult = matchApplication(jobs, subject, body, sender);
  // matchedJob is the best-matching job object, or null if no match found
  var matchedJob = matchResult.job;

  // Stage 4: Classify — determine what type of update this is
  var classResult = classifyEmail(subject, body);
  // classification is a string like "INTERVIEW_INVITE" or "REJECTION"
  var classification = classResult.classification;
  // suggestedStatus is the job status to suggest, like "Interview" or "Rejected"
  var suggestedStatus = classResult.suggestedStatus;

  // Build the result object
  var company = matchedJob ? matchedJob.company : null;
  var role = matchedJob ? matchedJob.title : null;
  var summary = buildSummary(classification, company, role);

  var emailSnippet = emailData.snippet || "";
  if (emailSnippet.length > 500) {
    emailSnippet = emailSnippet.substring(0, 500);
  }

  return {
    emailId: emailData.id,
    classification: classification,
    confidence: conf,
    confidenceLevel: level,
    matchedApplicationId: matchedJob ? matchedJob.id : null,
    matchedCompany: company,
    matchedRole: role,
    suggestedStatus: suggestedStatus,
    summary: summary,
    emailSubject: subject,
    emailSender: sender,
    emailDate: emailData.date || null,
    emailSnippet: emailSnippet,
  };
}

module.exports = {
  processEmail: processEmail,
  preFilter: preFilter,
  scoreEmail: scoreEmail,
  matchApplication: matchApplication,
  classifyEmail: classifyEmail,
};
