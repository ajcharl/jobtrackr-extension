// Main entry point for the JobTrackr API server.
// Sets up Express, CORS, JSON parsing, route mounting, error handling,
// and starts listening on the configured port.

var express = require("express");
var cors = require("cors");
var config = require("./config");
var { initializeDatabase } = require("./database");

// Import all route modules
var authRouter = require("./routes/auth");
var jobsRouter = require("./routes/jobs");
var gmailRouter = require("./routes/gmail");
var emailSyncRouter = require("./routes/emailSync");

var app = express();

// --- Middleware ---

// Parse incoming JSON request bodies
app.use(express.json());

// Set up CORS to allow requests from the frontend and Chrome extension.
// corsOptions controls which origins can make requests to this server.
var corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like Postman, curl, or server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Allow any chrome-extension:// origin
    if (origin.startsWith("chrome-extension://")) {
      callback(null, true);
      return;
    }

    // Allow origins from the config list
    if (config.corsOrigins.indexOf(origin) !== -1) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// --- Routes ---

// Health check endpoint — returns a simple OK response
app.get("/", function (req, res) {
  res.json({ status: "ok" });
});

// Mount each router under its URL prefix
app.use("/auth", authRouter);
app.use("/jobs", jobsRouter);
app.use("/gmail", gmailRouter);
app.use("/email-sync", emailSyncRouter);

// --- Error handling ---

// Catches any unhandled errors from route handlers and sends a 500 response.
// The "next" parameter is required even though it's unused — Express uses the
// 4-argument signature to identify this as an error handler.
app.use(function (err, req, res, next) {  // eslint-disable-line no-unused-vars
  console.error("Unhandled error:", err);
  res.status(500).json({ detail: "Internal server error" });
});

// --- Start server ---

async function startServer() {
  // Create tables and run migrations before accepting requests
  await initializeDatabase();
  console.log("Database initialized.");

  app.listen(config.port, function () {
    console.log("JobTrackr API running on port " + config.port);
  });
}

startServer().catch(function (err) {
  console.error("Failed to start server:", err);
  process.exit(1);
});
