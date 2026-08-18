// Auth middleware — checks the Authorization header for a valid JWT token.
// If valid, attaches the user's info to req.user so route handlers can use it.
// If missing or invalid, sends a 401 Unauthorized response.

var jwt = require("jsonwebtoken");
var config = require("../config");

function requireAuth(req, res, next) {
  // authHeader is the "Authorization: Bearer <token>" header from the request
  var authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ detail: "Missing authorization header" });
    return;
  }

  // parts splits "Bearer <token>" into ["Bearer", "<token>"]
  var parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({ detail: "Invalid authorization format. Use: Bearer <token>" });
    return;
  }

  // token is the JWT string after "Bearer "
  var token = parts[1];

  try {
    // decoded contains the payload we stored when creating the token (userId, email)
    var decoded = jwt.verify(token, config.jwtSecret);

    // Attach user info to the request so route handlers can access it
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch (err) {
    res.status(401).json({ detail: "Invalid or expired token" });
    return;
  }
}

module.exports = requireAuth;
