// Ask content script for job data
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  chrome.tabs.sendMessage(tabs[0].id, "GET_JOB_DATA", function (response) {
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

    // Save to backend with auth token, fall back to chrome.storage
    document.getElementById("saveBtn").addEventListener("click", async function () {
      var payload = {
        title: response.title,
        company: response.company,
        source: response.source,
        url: response.url || null,
        status: "Applied",
        appliedAt: new Date().toISOString(),
      };
      try {
        // Read the JWT token from chrome.storage
        var tokenData = await new Promise(function (resolve) {
          chrome.storage.local.get(["jobtrackr_token"], function (data) {
            resolve(data);
          });
        });
        // token is the JWT stored after logging in via the dashboard
        var token = tokenData.jobtrackr_token || null;
        var headers = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = "Bearer " + token;
        }

        var res = await fetch(self.API_BASE + "/jobs", {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        alert("Saved!");
      } catch (err) {
        chrome.storage.local.get(["jobs"], function (data) {
          var jobs = data.jobs || [];
          jobs.unshift(Object.assign({}, payload, { id: Date.now() }));
          chrome.storage.local.set({ jobs: jobs }, function () {
            alert("Saved locally (backend offline).");
          });
        });
      }
    });
  });
});
