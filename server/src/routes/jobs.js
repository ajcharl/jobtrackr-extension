// All routes for creating, reading, updating, and deleting job applications.
// Includes soft-delete (trash), restore, batch operations, and permanent delete.
// Every route requires authentication and only shows jobs belonging to the logged-in user.

var express = require("express");
var { getPool } = require("../database");
var { formatJobResponse } = require("../helpers");
var requireAuth = require("../middleware/auth");

var router = express.Router();

// All job routes require a valid login token
router.use(requireAuth);

// Looks up a job by ID, but only if it belongs to the logged-in user.
// Returns the job row or sends a 404 and returns null.
async function findUserJobOr404(db, jobId, userId, res) {
  var result = await db.query(
    "SELECT * FROM jobs WHERE id = $1 AND user_id = $2",
    [jobId, userId]
  );
  // row is the matching job record, or undefined if not found
  var row = result.rows[0];
  if (!row) {
    res.status(404).json({ detail: "Job not found" });
    return null;
  }
  return row;
}

// Create a new job application for the logged-in user
router.post("/", async function (req, res, next) {
  try {
    var db = getPool();
    // userId comes from the JWT token, set by the auth middleware
    var userId = req.user.id;

    // Pull out the fields the client can send when creating a job
    var title = req.body.title;
    var company = req.body.company;
    var source = req.body.source || "";
    var status = req.body.status || "Applied";
    var url = req.body.url || null;
    var notes = req.body.notes || null;

    // Accept both camelCase "appliedAt" and snake_case "applied_at" from the client
    var appliedAt = req.body.appliedAt || req.body.applied_at || null;

    var result = await db.query(
      `INSERT INTO jobs (user_id, title, company, source, status, applied_at, url, notes)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8)
       RETURNING *`,
      [userId, title, company, source, status, appliedAt, url, notes]
    );

    // row is the newly created job record
    var row = result.rows[0];
    res.status(201).json(formatJobResponse(row));
  } catch (err) {
    next(err);
  }
});

// List all non-deleted jobs for the logged-in user, newest first
router.get("/", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;

    var result = await db.query(
      "SELECT * FROM jobs WHERE user_id = $1 AND is_deleted = false ORDER BY id DESC",
      [userId]
    );
    // rows is the array of all active job records for this user
    var rows = result.rows;
    var jobs = rows.map(function (row) { return formatJobResponse(row); });
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

// List all soft-deleted (trashed) jobs for the logged-in user
router.get("/trash", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;

    var result = await db.query(
      "SELECT * FROM jobs WHERE user_id = $1 AND is_deleted = true ORDER BY deleted_at DESC",
      [userId]
    );
    var rows = result.rows;
    var jobs = rows.map(function (row) { return formatJobResponse(row); });
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

// Permanently delete ALL trashed jobs for the logged-in user
router.delete("/trash/all", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;

    await db.query(
      "DELETE FROM jobs WHERE user_id = $1 AND is_deleted = true",
      [userId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Permanently delete selected trashed jobs by their IDs (only the user's own jobs)
router.delete("/trash/batch", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;
    // ids is the array of job IDs the client wants to permanently delete
    var ids = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(204).send();
      return;
    }
    await db.query(
      "DELETE FROM jobs WHERE id = ANY($1) AND user_id = $2 AND is_deleted = true",
      [ids, userId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Restore selected trashed jobs back to active, given an array of IDs
router.post("/trash/restore-batch", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;
    // ids is the array of job IDs the client wants to restore
    var ids = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.json([]);
      return;
    }
    var result = await db.query(
      `UPDATE jobs
       SET is_deleted = false, deleted_at = NULL, updated_at = NOW()
       WHERE id = ANY($1) AND user_id = $2 AND is_deleted = true
       RETURNING *`,
      [ids, userId]
    );
    var rows = result.rows;
    var restored = rows.map(function (row) { return formatJobResponse(row); });
    res.json(restored);
  } catch (err) {
    next(err);
  }
});

// Soft-delete multiple jobs at once (move them to trash)
router.post("/batch-delete", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;
    // ids is the array of job IDs the client wants to soft-delete
    var ids = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(204).send();
      return;
    }
    await db.query(
      `UPDATE jobs
       SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
       WHERE id = ANY($1) AND user_id = $2 AND is_deleted = false`,
      [ids, userId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Update a single job's fields (title, company, status, etc.)
router.patch("/:jobId", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;
    // jobId is the ID from the URL path
    var jobId = parseInt(req.params.jobId, 10);

    var job = await findUserJobOr404(db, jobId, userId, res);
    if (!job) {
      return;
    }
    if (job.is_deleted) {
      res.status(400).json({ detail: "Cannot update a deleted job" });
      return;
    }

    // Build the SET clause dynamically from whichever fields the client sent
    // allowedFields is the list of columns that the client is allowed to update
    var allowedFields = ["title", "company", "source", "status", "url", "notes"];
    var setClauses = [];
    var values = [];
    var paramIndex = 1;

    for (var i = 0; i < allowedFields.length; i++) {
      var field = allowedFields[i];
      if (req.body[field] !== undefined) {
        setClauses.push(field + " = $" + paramIndex);
        values.push(req.body[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      res.json(formatJobResponse(job));
      return;
    }

    setClauses.push("updated_at = NOW()");
    values.push(jobId);
    values.push(userId);

    var query = "UPDATE jobs SET " + setClauses.join(", ") +
      " WHERE id = $" + paramIndex + " AND user_id = $" + (paramIndex + 1) +
      " RETURNING *";
    var result = await db.query(query, values);
    // updatedRow is the job record after the update
    var updatedRow = result.rows[0];
    res.json(formatJobResponse(updatedRow));
  } catch (err) {
    next(err);
  }
});

// Soft-delete a single job (move it to trash)
router.delete("/:jobId", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;
    var jobId = parseInt(req.params.jobId, 10);

    var job = await findUserJobOr404(db, jobId, userId, res);
    if (!job) {
      return;
    }
    if (job.is_deleted) {
      res.status(400).json({ detail: "Job is already deleted" });
      return;
    }
    await db.query(
      "UPDATE jobs SET is_deleted = true, deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2",
      [jobId, userId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Restore a single job from trash back to active
router.post("/:jobId/restore", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;
    var jobId = parseInt(req.params.jobId, 10);

    var job = await findUserJobOr404(db, jobId, userId, res);
    if (!job) {
      return;
    }
    if (!job.is_deleted) {
      res.status(400).json({ detail: "Job is not deleted" });
      return;
    }
    var result = await db.query(
      "UPDATE jobs SET is_deleted = false, deleted_at = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *",
      [jobId, userId]
    );
    var updatedRow = result.rows[0];
    res.json(formatJobResponse(updatedRow));
  } catch (err) {
    next(err);
  }
});

// Permanently delete a single job (must already be in trash)
router.delete("/:jobId/permanent", async function (req, res, next) {
  try {
    var db = getPool();
    var userId = req.user.id;
    var jobId = parseInt(req.params.jobId, 10);

    var job = await findUserJobOr404(db, jobId, userId, res);
    if (!job) {
      return;
    }
    if (!job.is_deleted) {
      res.status(400).json({ detail: "Job must be in trash before permanent deletion" });
      return;
    }
    await db.query(
      "DELETE FROM jobs WHERE id = $1 AND user_id = $2",
      [jobId, userId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
