importScripts("config.js");
const API_BASE = self.API_BASE;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "JOB_SUBMITTED") {
    saveJob(msg.job);
  }
});

async function saveJob(job) {
  const payload = {
    title: job.title,
    company: job.company,
    source: job.source || "",
    status: "Applied",
    url: job.url || null,
    appliedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const created = await res.json();
    console.log("Job saved to backend:", created.id);
  } catch (err) {
    console.warn("Backend unavailable, saving to chrome.storage:", err.message);
    chrome.storage.local.get(["jobs"], (data) => {
      const jobs = data.jobs || [];
      jobs.unshift({ ...payload, id: Date.now() });
      chrome.storage.local.set({ jobs });
    });
  }

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "Job Saved!",
    message: `${job.title} at ${job.company} has been logged.`,
    priority: 2,
  });
}
