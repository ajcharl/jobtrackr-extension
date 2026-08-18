var API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

var TOKEN_KEY = "jobtrackr_token";
var PENDING_KEY = "pendingOps";

// Returns the stored JWT token, or null if not logged in
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Saves the JWT token to localStorage after login or register
function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

// Removes the JWT token on logout
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getPendingOps() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch (e) { return []; }
}

function savePendingOps(ops) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
}

function queueOp(path, options) {
  var ops = getPendingOps();
  ops.push({ path: path, options: options, ts: Date.now() });
  savePendingOps(ops);
}

async function flushPendingOps() {
  var ops = getPendingOps();
  if (ops.length === 0) return;
  var remaining = [];
  // token is the current JWT for authenticating queued requests
  var token = getToken();
  var authHeaders = {};
  if (token) {
    authHeaders["Authorization"] = "Bearer " + token;
  }
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    try {
      var headers = Object.assign(
        { "Content-Type": "application/json" },
        authHeaders,
        op.options ? op.options.headers : {}
      );
      var res = await fetch(API_BASE + op.path, {
        headers: headers,
        method: op.options ? op.options.method : "GET",
        body: op.options ? op.options.body : undefined,
      });
      if (!res.ok) remaining.push(op);
    } catch (e) {
      remaining.push(op);
    }
  }
  savePendingOps(remaining);
}

async function request(path, options) {
  if (!options) {
    options = {};
  }
  try {
    // token is the stored JWT to attach as a Bearer token
    var token = getToken();
    var headers = Object.assign(
      { "Content-Type": "application/json" },
      options.headers || {}
    );
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    var fetchOptions = Object.assign({}, options, { headers: headers });
    var res = await fetch(API_BASE + path, fetchOptions);

    // Auto-logout on 401 (expired or invalid token)
    if (res.status === 401) {
      clearToken();
      window.location.reload();
      return null;
    }

    if (!res.ok) throw new Error("HTTP " + res.status);
    if (res.status === 204) return { _success: true };
    return await res.json();
  } catch (err) {
    console.warn("[api] request failed:", path, err.message);
    return null;
  }
}

// Register a new account
async function register(email, password, name) {
  try {
    var res = await fetch(API_BASE + "/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password, name: name }),
    });
    var data = await res.json();
    if (!res.ok) {
      return { error: data.detail || "Registration failed" };
    }
    setToken(data.token);
    return { user: data.user, token: data.token };
  } catch (err) {
    return { error: "Network error. Is the server running?" };
  }
}

// Log in with email and password
async function login(email, password) {
  try {
    var res = await fetch(API_BASE + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
    });
    var data = await res.json();
    if (!res.ok) {
      return { error: data.detail || "Login failed" };
    }
    setToken(data.token);
    return { user: data.user, token: data.token };
  } catch (err) {
    return { error: "Network error. Is the server running?" };
  }
}

function logout() {
  clearToken();
}

// Checks if the stored token is still valid by calling /auth/me
async function getCurrentUser() {
  var token = getToken();
  if (!token) return null;
  var result = await request("/auth/me");
  return result;
}

export { getToken, setToken, clearToken, register, login, logout, getCurrentUser, API_BASE };

export var api = {
  getJobs: async function () {
    await flushPendingOps();
    return request("/jobs");
  },
  createJob: function (job) {
    return request("/jobs", { method: "POST", body: JSON.stringify(job) });
  },
  updateJob: async function (id, patch) {
    var result = await request("/jobs/" + id, { method: "PATCH", body: JSON.stringify(patch) });
    if (result === null) {
      queueOp("/jobs/" + id, { method: "PATCH", body: JSON.stringify(patch) });
    }
    return result;
  },
  deleteJob: async function (id) {
    var result = await request("/jobs/" + id, { method: "DELETE" });
    if (result === null) {
      queueOp("/jobs/" + id, { method: "DELETE" });
    }
    return result;
  },

  // Trash
  getTrash: function () { return request("/jobs/trash"); },
  restoreJob: function (id) { return request("/jobs/" + id + "/restore", { method: "POST" }); },
  permanentDeleteJob: function (id) {
    return request("/jobs/" + id + "/permanent", { method: "DELETE" });
  },
  emptyTrash: function () { return request("/jobs/trash/all", { method: "DELETE" }); },
  batchDeleteTrash: function (ids) {
    return request("/jobs/trash/batch", { method: "DELETE", body: JSON.stringify(ids) });
  },
  batchRestoreTrash: function (ids) {
    return request("/jobs/trash/restore-batch", { method: "POST", body: JSON.stringify(ids) });
  },
  batchDeleteJobs: function (ids) {
    return request("/jobs/batch-delete", { method: "POST", body: JSON.stringify(ids) });
  },

  // Gmail
  getGmailStatus: function () { return request("/gmail/status"); },
  disconnectGmail: function () { return request("/gmail/disconnect", { method: "POST" }); },

  // Email Sync
  runEmailSync: function () { return request("/email-sync/run", { method: "POST" }); },
  getSuggestions: function (state) {
    if (!state) { state = "pending"; }
    return request("/email-sync/suggestions?state=" + state);
  },
  updateSuggestion: function (id, action) {
    return request("/email-sync/suggestions/" + id, {
      method: "PATCH",
      body: JSON.stringify(action),
    });
  },
};
