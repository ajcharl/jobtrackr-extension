/**********************
 * 1) Small helpers
 **********************/
const HOST = location.hostname;
const SUCCESS_PATTERNS = [
  /application.*submitted/i,
  /successfully applied/i,
  /you applied/i,
  /application.*sent/i,
  /application.*received/i,
  /thank you for applying/i,
];
const CLEAN_LIMIT = 140;

const clean = (s = "") => s.replace(/\s+/g, " ").trim();
const looksLikeCss = (s = "") => /{.*:.*;/.test(s);

function getText(selectors = []) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el || ["STYLE", "SCRIPT"].includes(el.tagName)) continue;
    let v = el.innerText || el.textContent || el.content || "";
    v = clean(v);
    if (!v || v.length > CLEAN_LIMIT || looksLikeCss(v)) continue;
    if (el.offsetParent === null && el.getClientRects().length === 0) continue;
    return v;
  }
  return "";
}

function stripTitle(t) {
  return clean(t.replace(/-+\s*job post$/i, ""));
}

function stripCompany(c) {
  return clean(c.split("\n")[0].split("·")[0]);
}

function getFromLDJSON() {
  try {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const block of scripts) {
      const parsed = JSON.parse(block.textContent.trim());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const jp = arr.find(o => o && o["@type"] === "JobPosting");
      if (jp) {
        return {
          title: jp.title || "",
          company: jp.hiringOrganization?.name || ""
        };
      }
    }
  } catch (_) {}
  return { title: "", company: "" };
}

/**********************
 * 2) Extract job data
 **********************/
function extractJobData() {
  let title = "", company = "";

  if (HOST.includes("linkedin.com")) {
    // primary selectors for title
    title = getText([
      "h1.topcard__title",
      "h2.jobs-unified-top-card__job-title",
      ".topcard__content-left h1"
    ]);

    // primary selectors for company (added the new one)
    company = getText([
      ".topcard__org-name-link",
      "a.jobs-unified-top-card__company-name-link",
      ".jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__company-name"
    ]);

    // fallback using the “display-flex…mt2” wrapper
    const wrap = document.querySelector(
      "div.display-flex.justify-space-between.flex-wrap.mt2"
    );
    if (wrap && (!title || !company)) {
      const parts = clean(wrap.innerText).split("·");
      title   = title   || clean(parts[0] || "");
      company = company || clean(parts[1] || "");
    }
  }
  else if (HOST.includes("indeed.")) {
    const ld = getFromLDJSON();
    title   = ld.title;
    company = ld.company;

    if (!title) {
      title = getText([
        'meta[property="og:title"]',
        'meta[name="twitter:title"]'
      ]);
    }
    if (!title) {
      title = getText([
        '.jobsearch-JobInfoHeader-title-container h1',
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        'h1.jobsearch-JobInfoHeader-title',
        'h1'
      ]);
    }
    if (!company) {
      company = getText([
        '[data-testid="jobsearch-CompanyInfoContainer"] a',
        'a[href*="/cmp/"]',
        '.jobsearch-CompanyInfoWithoutHeaderImage div'
      ]);
    }
  }

  else if (HOST.includes("myworkday.com") || HOST.includes("myworkdayjobs.com")) {
    // Workday: company name is typically the first part of the subdomain
    // e.g., "acme.wd5.myworkday.com" → "acme"
    const subParts = HOST.split(".");
    const companySlug = subParts[0] || "";

    // Try to get job title from page headings
    // The h2 itself has data-automation-id="jobPostingHeader" on most Workday sites
    title = getText([
      'h2[data-automation-id="jobPostingHeader"]',
      '[data-automation-id="jobPostingHeader"]',
      'h2[data-automation-id="jobTitle"]',
      '[data-automation-id="jobPostingHeader"] h2',
    ]);

    // Fallback: try all h2s but skip non-job-title ones
    if (!title) {
      const h2s = document.querySelectorAll("h2");
      const skipPatterns = /^(welcome|my information|my experience|sign in|log in|self.identif|loading|review|submit|application|resume|cover letter|how did you hear|voluntary|eeo|diversity)$/i;
      // Also skip very short generic words (likely UI labels, not job titles)
      const tooGeneric = /^(loading\.{0,3}|review|submit|next|back|save|cancel|done|step \d)$/i;
      for (const h2 of h2s) {
        const t = clean(h2.innerText || h2.textContent || "");
        if (t && t.length <= CLEAN_LIMIT && !skipPatterns.test(t) && !tooGeneric.test(t)) {
          title = t;
          break;
        }
      }
    }

    // Try to get company from the page
    company = getText([
      '[data-automation-id="company"]',
      '[data-automation-id="organizationName"]',
      '.css-vlkb6a',             // Workday company label class
    ]);

    // Fallback: derive company from subdomain slug
    if (!company && companySlug) {
      company = companySlug
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
    }

    // Try to get title from page <title> as last resort
    if (!title) {
      const pageTitle = document.title || "";
      // Workday page titles often look like "Job Title - Company - Workday"
      const parts = pageTitle.split(/\s*[-–|]\s*/);
      if (parts.length >= 2) {
        title = clean(parts[0]);
      }
    }
  }

  title   = title   ? stripTitle(title)     : "Unknown Title";
  company = company ? stripCompany(company) : "Unknown Company";

  return {
    title,
    company,
    source: HOST,
    status: "Applied",
    url: location.href
  };
}

/**********************
 * 3) save/get pending
 **********************/
function savePending(job) {
  if (chrome?.storage?.local) {
    chrome.storage.local.set({ pendingJob: job });
  }
}
function getPending(cb) {
  if (chrome?.storage?.local) {
    chrome.storage.local.get("pendingJob", ({ pendingJob }) => {
      cb(pendingJob);
      chrome.storage.local.remove("pendingJob");
    });
  } else cb(null);
}

/**********************
 * 4) In-page toast
 **********************/
function showDialog(message = "✅ Job saved!") {
  if (document.getElementById("job-tracker-dialog")) return;
  const div = document.createElement("div");
  div.id = "job-tracker-dialog";
  div.innerHTML = `
    <div style="
      position: fixed;
      top: 20px; left: 50%;
      transform: translateX(-50%);
      background: white; border: 1px solid #ccc;
      padding: 16px 24px; border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      font-family: sans-serif; font-size: 15px;
      z-index: 99999;
    ">
      ${message}
    </div>`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 6000);
}

/**********************
 * 5) Global “Apply” click handler
 **********************/
document.body.addEventListener("click", e => {
  // Workday is handled by its own dedicated interceptor in section 5b
  if (HOST.includes("myworkday.com") || HOST.includes("myworkdayjobs.com")) return;

  let el = e.target;
  while (el && el !== document.body) {
    const txt = clean(el.innerText || el.textContent || "");
    const isApplyButton = el.matches("button, a");
    const isLinkedInWrapper = el.classList?.contains("jobs-s-apply");

    if ((isApplyButton || isLinkedInWrapper) &&
        /apply now|easy apply|apply on company site|submit application|apply/i.test(txt)
    ) {
      const job = extractJobData();

      if (HOST.includes("linkedin.com")) {
        // LinkedIn: immediate confirm
        const ok = window.confirm(
          `Track this application?\n\n${job.title}\n at ${job.company}`
        );
        if (ok) {
          chrome.runtime.sendMessage({ type: "JOB_SUBMITTED", job });
          showDialog(`✅ Saved "${job.title}" at ${job.company}`);
        }
      } else {
        // Indeed: old pending→confirm flow
        savePending(job);
        console.log("[Job Tracker] pending saved on click:", job);
      }
      break;
    }
    el = el.parentElement;
  }
}, true);

/**********************
 * 5b) Workday-specific click interceptor
 **********************/
if (HOST.includes("myworkday.com") || HOST.includes("myworkdayjobs.com")) {
  // Simple approach: capture job data when "Apply" is clicked (title is visible),
  // then use that stored data when "Submit" is clicked later.

  const WD_KEY = "workdayJobData";

  function saveWorkdayJob(job) {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [WD_KEY]: job });
      console.log("[Job Tracker] Workday job saved on Apply:", job);
    }
  }

  function getWorkdayJob(cb) {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(WD_KEY, (result) => cb(result[WD_KEY] || null));
    } else cb(null);
  }

  document.addEventListener("click", e => {
    let target = e.target;
    let clickText = "";
    while (target && target !== document.body) {
      clickText = (target.innerText || target.textContent || "").trim().toLowerCase();
      if (clickText) break;
      target = target.parentElement;
    }

    // When user clicks "Apply" — capture and store the job data (title is visible now)
    if (/^apply$/i.test(clickText) || /^apply now$/i.test(clickText)) {
      const job = extractJobData();
      saveWorkdayJob(job);
    }

    // When user clicks "Submit" — use the stored data from the Apply step
    if (clickText === "submit" || clickText === "submit application") {
      getWorkdayJob(storedJob => {
        const job = storedJob || extractJobData();
        console.log("[Job Tracker] Workday submit detected:", job);
        const ok = window.confirm(
          `Track this Workday application?\n\n${job.title}\n at ${job.company}`
        );
        if (ok) {
          chrome.runtime.sendMessage({ type: "JOB_SUBMITTED", job });
          showDialog(`✅ Saved "${job.title}" at ${job.company}`);
          chrome.storage.local.remove(WD_KEY);
        }
      });
    }
  }, true);
}

/**********************
 * 6) Initial capture
 **********************/
if ((HOST.includes("indeed.") || HOST.includes("myworkday.com") || HOST.includes("myworkdayjobs.com")) && document.querySelector("h1, h2")) {
  savePending(extractJobData());
}

/**********************
 * 6b) Respond to popup
 **********************/
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === "GET_JOB_DATA") {
    sendResponse(extractJobData());
  }
});

/**********************
 * 7) Confirm observer (Indeed only)
 **********************/
if (HOST.includes("indeed.") || HOST.includes("myworkday.com") || HOST.includes("myworkdayjobs.com")) {
  // Workday-specific success patterns
  const WORKDAY_SUCCESS_PATTERNS = [
    /application.*submitted/i,
    /thank you for applying/i,
    /your application has been submitted/i,
    /successfully submitted/i,
  ];

  function checkForSuccess() {
    const isWorkday = HOST.includes("myworkday.com") || HOST.includes("myworkdayjobs.com");
    const selectors = isWorkday
      ? 'h1, h2, h3, [role="heading"], [data-automation-id="confirmation"], [data-automation-id*="success"], [data-automation-id="thankYouMessage"]'
      : 'h1, h2, h3, [role="heading"], [data-testid*="success"], [class*="post-apply"], [class*="postApply"]';
    const patterns = isWorkday
      ? [...SUCCESS_PATTERNS, ...WORKDAY_SUCCESS_PATTERNS]
      : SUCCESS_PATTERNS;

    const candidates = document.querySelectorAll(selectors);
    for (const el of candidates) {
      const txt = (el.innerText || el.textContent || "").trim();
      if (txt && patterns.some(re => re.test(txt))) return true;
    }
    return false;
  }

  let submitted = false;
  const confObs = new MutationObserver(() => {
    if (submitted) return;
    if (checkForSuccess()) {
      submitted = true;
      getPending(pending => {
        const job = pending || extractJobData();
        chrome.runtime.sendMessage({ type: "JOB_SUBMITTED", job });
        showDialog(`✅ Saved "${job.title}" at ${job.company}`);
      });
      confObs.disconnect();
    }
  });
  confObs.observe(document.body, { childList: true, subtree: true });
}
