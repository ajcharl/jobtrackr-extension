const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

const PENDING_KEY = "pendingOps";

function getPendingOps() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch { return []; }
}

function savePendingOps(ops) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
}

function queueOp(path, options) {
  const ops = getPendingOps();
  ops.push({ path, options, ts: Date.now() });
  savePendingOps(ops);
}

async function flushPendingOps() {
  const ops = getPendingOps();
  if (ops.length === 0) return;
  const remaining = [];
  for (const op of ops) {
    try {
      const res = await fetch(`${API_BASE}${op.path}`, {
        headers: { "Content-Type": "application/json", ...op.options?.headers },
        ...op.options,
      });
      if (!res.ok) remaining.push(op);
    } catch {
      remaining.push(op);
    }
  }
  savePendingOps(remaining);
}

async function request(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (res.status === 204) return { _success: true };
    return await res.json();
  } catch (err) {
    console.warn("[api] request failed:", path, err.message);
    return null;
  }
}

export const api = {
  getJobs: async () => {
    await flushPendingOps();
    return request("/jobs");
  },
  createJob: (job) =>
    request("/jobs", { method: "POST", body: JSON.stringify(job) }),
  updateJob: async (id, patch) => {
    const result = await request("/jobs/" + id, { method: "PATCH", body: JSON.stringify(patch) });
    if (result === null) {
      queueOp("/jobs/" + id, { method: "PATCH", body: JSON.stringify(patch) });
    }
    return result;
  },
  deleteJob: async (id) => {
    const result = await request("/jobs/" + id, { method: "DELETE" });
    if (result === null) {
      queueOp("/jobs/" + id, { method: "DELETE" });
    }
    return result;
  },

  // Trash
  getTrash: () => request("/jobs/trash"),
  restoreJob: (id) => request("/jobs/" + id + "/restore", { method: "POST" }),
  permanentDeleteJob: (id) =>
    request("/jobs/" + id + "/permanent", { method: "DELETE" }),
  emptyTrash: () => request("/jobs/trash/all", { method: "DELETE" }),
  batchDeleteTrash: (ids) =>
    request("/jobs/trash/batch", { method: "DELETE", body: JSON.stringify(ids) }),
  batchRestoreTrash: (ids) =>
    request("/jobs/trash/restore-batch", { method: "POST", body: JSON.stringify(ids) }),
  batchDeleteJobs: (ids) =>
    request("/jobs/batch-delete", { method: "POST", body: JSON.stringify(ids) }),

  // Gmail
  getGmailStatus: () => request("/gmail/status"),
  disconnectGmail: () => request("/gmail/disconnect", { method: "POST" }),

  // Yahoo
  getYahooStatus: () => request("/yahoo/status"),
  disconnectYahoo: () => request("/yahoo/disconnect", { method: "POST" }),

  // Email Sync
  runEmailSync: () => request("/email-sync/run", { method: "POST" }),
  getSuggestions: (state = "pending") =>
    request("/email-sync/suggestions?state=" + state),
  updateSuggestion: (id, action) =>
    request("/email-sync/suggestions/" + id, {
      method: "PATCH",
      body: JSON.stringify(action),
    }),
};
