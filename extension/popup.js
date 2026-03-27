// Ask content script for job data
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, "GET_JOB_DATA", (response) => {
    if (chrome.runtime.lastError || !response) {
      document.getElementById("title").innerText = "N/A";
      document.getElementById("company").innerText = "N/A";
      document.getElementById("source").innerText = "N/A";
      return;
    }

    // Fill in popup
    document.getElementById("title").innerText = response.title;
    document.getElementById("company").innerText = response.company;
    document.getElementById("source").innerText = response.source;

    // Save to backend, fall back to chrome.storage
    document.getElementById("saveBtn").addEventListener("click", async () => {
      const payload = {
        title: response.title,
        company: response.company,
        source: response.source,
        url: response.url || null,
        status: "Applied",
        appliedAt: new Date().toISOString(),
      };
      try {
        const res = await fetch("http://localhost:8000/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        alert("Saved!");
      } catch (err) {
        chrome.storage.local.get(["jobs"], (data) => {
          const jobs = data.jobs || [];
          jobs.unshift({ ...payload, id: Date.now() });
          chrome.storage.local.set({ jobs }, () => {
            alert("Saved locally (backend offline).");
          });
        });
      }
    });
  });
});
