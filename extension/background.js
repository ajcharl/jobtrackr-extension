importScripts("config.js");
var API_BASE = self.API_BASE;

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === "JOB_SUBMITTED") {
    saveJob(msg.job);
  }
});

// Reads the JWT token from chrome.storage for authenticating API calls
function getStoredToken() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(["jobtrackr_token"], function (data) {
      resolve(data.jobtrackr_token || null);
    });
  });
}

async function saveJob(job) {
  var payload = {
    title: job.title,
    company: job.company,
    source: job.source || "",
    status: "Applied",
    url: job.url || null,
    appliedAt: new Date().toISOString(),
  };

  try {
    // token is the JWT stored after logging in via the dashboard
    var token = await getStoredToken();
    var headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    var res = await fetch(API_BASE + "/jobs", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var created = await res.json();
    console.log("Job saved to backend:", created.id);
  } catch (err) {
    console.warn("Backend unavailable, saving to chrome.storage:", err.message);
    chrome.storage.local.get(["jobs"], function (data) {
      var jobs = data.jobs || [];
      jobs.unshift(Object.assign({}, payload, { id: Date.now() }));
      chrome.storage.local.set({ jobs: jobs });
    });
  }

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "Job Saved!",
    message: job.title + " at " + job.company + " has been logged.",
    priority: 2,
  });
}
