// Gmail API integration: builds OAuth URLs, exchanges codes for tokens,
// refreshes tokens, fetches the user's email address, and pulls recent emails.

var config = require("../config");

var GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

var GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

// Builds the Google OAuth2 authorization URL that the user gets redirected to
function getAuthUrl() {
  var params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  return GOOGLE_AUTH_URL + "?" + params.toString();
}

// Sends the authorization code to Google and gets back access + refresh tokens
async function exchangeCode(code) {
  var response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: config.googleRedirectUri,
    }),
  });

  if (!response.ok) {
    var errorText = await response.text();
    throw new Error("Token exchange failed: " + errorText);
  }

  return await response.json();
}

// Uses a refresh token to get a new access token when the old one expires
async function refreshAccessToken(refreshToken) {
  var response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    var errorText = await response.text();
    throw new Error("Token refresh failed: " + errorText);
  }

  return await response.json();
}

// Fetches the authenticated user's email address from Google's userinfo API
async function getUserEmail(accessToken) {
  var response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: "Bearer " + accessToken },
  });

  if (!response.ok) {
    throw new Error("Failed to get user email");
  }

  // data contains the user's Google profile info
  var data = await response.json();
  return data.email || "";
}

// Pulls recent emails from the user's Gmail inbox.
// Returns an array of objects with: id, subject, sender, date, snippet, body
async function fetchRecentEmails(accessToken, maxResults, daysBack) {
  // Default maxResults to 50 and daysBack to 7 if not provided
  if (maxResults === undefined) {
    maxResults = 50;
  }
  if (daysBack === undefined) {
    daysBack = 7;
  }

  // afterEpoch is a Unix timestamp for "daysBack days ago"
  var afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - daysBack);
  var afterEpoch = Math.floor(afterDate.getTime() / 1000);

  // Step 1: Get the list of message IDs matching our search query
  var listUrl = GMAIL_API_BASE + "/messages?" + new URLSearchParams({
    maxResults: String(maxResults),
    q: "after:" + afterEpoch + " category:primary",
  });

  var listResponse = await fetch(listUrl, {
    headers: { Authorization: "Bearer " + accessToken },
  });

  if (!listResponse.ok) {
    throw new Error("Failed to list Gmail messages");
  }

  var listData = await listResponse.json();
  // messageStubs is the array of {id, threadId} objects from Gmail
  var messageStubs = listData.messages || [];

  var emails = [];

  // Step 2: Fetch the full content of each message one by one
  for (var i = 0; i < messageStubs.length; i++) {
    var msgId = messageStubs[i].id;

    var msgUrl = GMAIL_API_BASE + "/messages/" + msgId + "?format=full";
    var msgResponse = await fetch(msgUrl, {
      headers: { Authorization: "Bearer " + accessToken },
    });

    if (msgResponse.status !== 200) {
      continue;
    }

    var msgData = await msgResponse.json();
    var parsed = parseMessage(msgData);
    emails.push(parsed);
  }

  return emails;
}

// Extracts the useful fields (subject, sender, date, body) from a raw Gmail message
function parseMessage(msgData) {
  // headers is the array of {name, value} pairs from the Gmail API
  var rawHeaders = [];
  if (msgData.payload && msgData.payload.headers) {
    rawHeaders = msgData.payload.headers;
  }

  // headerMap converts the array into a lookup object keyed by lowercase header name
  var headerMap = {};
  for (var i = 0; i < rawHeaders.length; i++) {
    var headerName = rawHeaders[i].name.toLowerCase();
    var headerValue = rawHeaders[i].value;
    headerMap[headerName] = headerValue;
  }

  var subject = headerMap["subject"] || "(no subject)";
  var sender = headerMap["from"] || "";

  // Parse the date from Gmail's internalDate (milliseconds since epoch)
  var emailDate = null;
  try {
    var internalDateMs = parseInt(msgData.internalDate, 10);
    if (internalDateMs) {
      emailDate = new Date(internalDateMs);
    }
  } catch (e) {
    // leave emailDate as null if parsing fails
  }

  var snippet = msgData.snippet || "";
  var body = extractBody(msgData.payload || {});

  return {
    id: msgData.id,
    subject: subject,
    sender: sender,
    date: emailDate,
    snippet: snippet,
    body: body,
  };
}

// Digs through the Gmail message payload to find the plain text body.
// Gmail payloads can be nested (multipart), so this function checks recursively.
function extractBody(payload) {
  // Check if this part itself is plain text with data
  if (payload.mimeType === "text/plain" && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Otherwise, look through the sub-parts
  var parts = payload.parts || [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (part.mimeType === "text/plain" && part.body && part.body.data) {
      return decodeBase64Url(part.body.data);
    }
    // Check nested multipart
    if (part.parts) {
      var nested = extractBody(part);
      if (nested) {
        return nested;
      }
    }
  }

  return "";
}

// Decodes a URL-safe base64 string (the format Gmail uses for message bodies)
function decodeBase64Url(data) {
  try {
    // Replace URL-safe characters with standard base64 characters
    var base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch (e) {
    return "";
  }
}

module.exports = {
  getAuthUrl: getAuthUrl,
  exchangeCode: exchangeCode,
  refreshAccessToken: refreshAccessToken,
  getUserEmail: getUserEmail,
  fetchRecentEmails: fetchRecentEmails,
};
