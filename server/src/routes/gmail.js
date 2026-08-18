// Gmail OAuth routes: connect (redirect to Google), handle callback,
// check connection status, and disconnect.
// All routes require authentication — tokens are stored per user.

var express = require("express");
var jwt = require("jsonwebtoken");
var { getPool } = require("../database");
var config = require("../config");
var gmailService = require("../services/gmailService");
var requireAuth = require("../middleware/auth");

var router = express.Router();

// Redirect the user to Google's OAuth consent screen.
// Accepts the JWT token as a query parameter since browser redirects can't set headers.
router.get("/connect", function (req, res) {
  // token comes from the ?token= query param set by the frontend
  var token = req.query.token;

  if (!token) {
    res.status(401).json({ detail: "Missing token. Please log in first." });
    return;
  }

  // Verify the token is valid before starting the OAuth flow
  try {
    jwt.verify(token, config.jwtSecret);
  } catch (e) {
    res.status(401).json({ detail: "Invalid or expired token. Please log in again." });
    return;
  }

  // authUrl is the Google consent page URL
  var authUrl = gmailService.getAuthUrl();

  // Pass the JWT as OAuth state so the callback can identify the user
  res.redirect(authUrl + "&state=" + encodeURIComponent(token));
});

// Handle the callback from Google after the user grants permission.
// Stores the tokens in the database linked to the user, then redirects to the frontend.
router.get("/callback", async function (req, res, next) {
  try {
    var db = getPool();

    // error and code are query parameters Google sends back
    var error = req.query.error;
    var code = req.query.code;
    // state contains the JWT token we passed in /connect
    var state = req.query.state;

    if (error) {
      res.redirect("http://localhost:3000?gmail_error=" + error);
      return;
    }

    if (!code) {
      res.status(400).json({ detail: "Missing authorization code" });
      return;
    }

    // Figure out which user started this OAuth flow by decoding the state token
    var userId = null;
    if (state) {
      try {
        var decoded = jwt.verify(state, config.jwtSecret);
        userId = decoded.userId;
      } catch (e) {
        res.status(401).json({ detail: "Invalid or expired session. Please log in and try again." });
        return;
      }
    }

    if (!userId) {
      res.status(401).json({ detail: "Could not identify user. Please log in and try again." });
      return;
    }

    // tokenData contains access_token, refresh_token, expires_in, etc.
    var tokenData;
    try {
      tokenData = await gmailService.exchangeCode(code);
    } catch (e) {
      res.status(400).json({ detail: "Token exchange failed: " + e.message });
      return;
    }

    // Pull out the token fields we need to store
    var accessToken = tokenData.access_token;
    var refreshToken = tokenData.refresh_token || "";
    var expiresIn = tokenData.expires_in || 3600;

    // tokenExpiry is the timestamp when this access token will stop working
    var tokenExpiry = new Date(Date.now() + expiresIn * 1000);

    // Try to get the user's Gmail address
    var email = "";
    try {
      email = await gmailService.getUserEmail(accessToken);
    } catch (e) {
      // not critical — we'll just store an empty email
    }

    // Delete any existing tokens for THIS user (each user gets one Gmail connection)
    await db.query("DELETE FROM gmail_tokens WHERE user_id = $1", [userId]);

    // Insert the new token linked to this user
    await db.query(
      `INSERT INTO gmail_tokens (user_id, access_token, refresh_token, token_expiry, email)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, accessToken, refreshToken, tokenExpiry, email]
    );

    // Send the user back to the frontend with a success flag
    res.redirect("http://localhost:3000?gmail_connected=true");
  } catch (err) {
    next(err);
  }
});

// Check whether Gmail is connected for the logged-in user
router.get("/status", requireAuth, async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;

    var result = await db.query(
      "SELECT * FROM gmail_tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
      [userId]
    );

    // token is the stored Gmail token for this user, or undefined if not connected
    var token = result.rows[0];

    if (!token) {
      res.json({ connected: false, email: null });
      return;
    }

    res.json({ connected: true, email: token.email });
  } catch (err) {
    next(err);
  }
});

// Disconnect Gmail by removing the logged-in user's stored tokens
router.post("/disconnect", requireAuth, async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;

    await db.query("DELETE FROM gmail_tokens WHERE user_id = $1", [userId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
