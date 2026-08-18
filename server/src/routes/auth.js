// Auth routes: register a new account, log in, and get the current user's info.

var express = require("express");
var bcrypt = require("bcrypt");
var jwt = require("jsonwebtoken");
var { getPool } = require("../database");
var config = require("../config");
var requireAuth = require("../middleware/auth");

var router = express.Router();

// How many rounds bcrypt uses to hash the password (higher = slower but more secure)
var SALT_ROUNDS = 10;

// How long a JWT token lasts before the user has to log in again
var TOKEN_EXPIRY = "7d";

// Creates a JWT token containing the user's ID and email
function generateToken(userId, email) {
  var payload = {
    userId: userId,
    email: email,
  };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: TOKEN_EXPIRY });
}

// Register a new user account
router.post("/register", async function (req, res, next) {
  try {
    var db = getPool();

    // Pull out the registration fields from the request body
    var email = req.body.email;
    var password = req.body.password;
    var name = req.body.name;

    // Make sure all required fields are provided
    if (!email || !password || !name) {
      res.status(400).json({ detail: "Email, password, and name are required" });
      return;
    }

    // Check if a user with this email already exists
    var existingResult = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (existingResult.rows.length > 0) {
      res.status(409).json({ detail: "An account with this email already exists" });
      return;
    }

    // Hash the password so we never store the plain text version
    var passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert the new user into the database
    var result = await db.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [email.toLowerCase(), passwordHash, name]
    );

    // newUser is the database row for the newly created account
    var newUser = result.rows[0];

    // Generate a login token so they don't have to log in separately after registering
    var token = generateToken(newUser.id, newUser.email);

    res.status(201).json({
      token: token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        createdAt: newUser.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Log in with email and password
router.post("/login", async function (req, res, next) {
  try {
    var db = getPool();

    // Pull out the login credentials from the request body
    var email = req.body.email;
    var password = req.body.password;

    if (!email || !password) {
      res.status(400).json({ detail: "Email and password are required" });
      return;
    }

    // Look up the user by email
    var result = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    // user is the database row for this email, or undefined if no account exists
    var user = result.rows[0];

    if (!user) {
      res.status(401).json({ detail: "Invalid email or password" });
      return;
    }

    // Compare the provided password against the stored hash
    var passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      res.status(401).json({ detail: "Invalid email or password" });
      return;
    }

    // Generate a login token
    var token = generateToken(user.id, user.email);

    res.json({
      token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get the currently logged-in user's info (requires a valid token)
router.get("/me", requireAuth, async function (req, res, next) {
  try {
    var db = getPool();

    // req.user.id was set by the requireAuth middleware from the JWT token
    var result = await db.query(
      "SELECT id, email, name, created_at FROM users WHERE id = $1",
      [req.user.id]
    );

    var user = result.rows[0];

    if (!user) {
      res.status(404).json({ detail: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.created_at,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
