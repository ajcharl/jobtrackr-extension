// Sets up the PostgreSQL connection pool using the pg library.
// All route files import getPool() to run queries.

var pg = require("pg");
var config = require("./config");

var pool = null;

// Creates the connection pool on first call, reuses it after that
function getPool() {
  if (!pool) {
    // Parse the DATABASE_URL to configure the pool
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : false,
    });
  }
  return pool;
}

// Runs all the CREATE TABLE statements and idempotent ALTER TABLE migrations.
// Called once when the server starts up.
async function initializeDatabase() {
  var db = getPool();

  // Create the users table — stores login credentials
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Create the jobs table — each job belongs to a user via user_id
  await db.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title VARCHAR(255) NOT NULL,
      company VARCHAR(255) NOT NULL,
      source VARCHAR(255) NOT NULL DEFAULT '',
      status VARCHAR(50) NOT NULL DEFAULT 'Applied',
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      url TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMPTZ
    );
  `);

  // Create the gmail_tokens table — each token belongs to a user via user_id
  await db.query(`
    CREATE TABLE IF NOT EXISTS gmail_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_expiry TIMESTAMPTZ,
      email VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Create the application_update_suggestions table — each suggestion belongs to a user
  await db.query(`
    CREATE TABLE IF NOT EXISTS application_update_suggestions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      application_id INTEGER,
      detected_type VARCHAR(50) NOT NULL,
      suggested_status VARCHAR(50) NOT NULL,
      confidence_score REAL NOT NULL DEFAULT 0.0,
      email_subject TEXT,
      email_sender VARCHAR(255),
      email_date TIMESTAMPTZ,
      email_snippet TEXT,
      gmail_message_id VARCHAR(255) UNIQUE,
      state VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Idempotent column additions for older databases that already have these tables
  await safeAddColumn("jobs", "is_deleted", "BOOLEAN NOT NULL DEFAULT false");
  await safeAddColumn("jobs", "deleted_at", "TIMESTAMPTZ");
  await safeAddColumn("jobs", "user_id", "INTEGER REFERENCES users(id)");
  await safeAddColumn("gmail_tokens", "user_id", "INTEGER REFERENCES users(id)");
  await safeAddColumn("application_update_suggestions", "user_id", "INTEGER REFERENCES users(id)");
}

// Adds a column to a table only if it doesn't already exist.
// Catches the "duplicate column" error and ignores it.
async function safeAddColumn(table, column, definition) {
  var db = getPool();
  try {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    // Error code 42701 means "duplicate_column" in PostgreSQL — safe to ignore
    if (err.code !== "42701") {
      throw err;
    }
  }
}

module.exports = {
  getPool: getPool,
  initializeDatabase: initializeDatabase,
};
