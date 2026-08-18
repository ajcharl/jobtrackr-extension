// Loads environment variables from .env and exports them as a config object.

require("dotenv").config();

// Pull out each env var we need, with sensible defaults
var databaseUrl = process.env.DATABASE_URL || "postgresql://jobtrackr:jobtrackr@localhost:5432/jobtrackr";
var corsOriginsRaw = process.env.CORS_ORIGINS || "http://localhost:3000";
var googleClientId = process.env.GOOGLE_CLIENT_ID || "";
var googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
var googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:8000/gmail/callback";
var jwtSecret = process.env.JWT_SECRET || "change-me-in-production";
var port = parseInt(process.env.PORT, 10) || 8000;

// Split the comma-separated CORS origins into an array
var corsOrigins = corsOriginsRaw
  .split(",")
  .map(function (origin) { return origin.trim(); })
  .filter(function (origin) { return origin.length > 0; });

var config = {
  databaseUrl: databaseUrl,
  corsOrigins: corsOrigins,
  googleClientId: googleClientId,
  googleClientSecret: googleClientSecret,
  googleRedirectUri: googleRedirectUri,
  jwtSecret: jwtSecret,
  port: port,
};

module.exports = config;
