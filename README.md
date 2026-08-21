# JobTrackr

**JobTrackr** is a Chrome extension that automatically tracks your job applications as you apply to jobs on Indeed, Workday and Linkedin

---

## Install

### Quick install
1. Download the latest `jobtrackr-extension.zip` from the [Releases page](../../releases).
2. Unzip it somewhere.
3. Open `chrome://extensions` in Chrome.
4. Toggle **Developer mode** on (top right).
5. Click **Load unpacked** → select the unzipped folder.
6. Apply to a job on LinkedIn / Indeed / Workday and the extension does the rest.

---

## Architecture

```
┌──────────────────┐       ┌──────────────────────┐                   ┌──────────────┐
│  Chrome ext.     │──────▶│  NodeJS/Express on Render       │──────▶│  Postgres    │
│  (content +      │       │  jobs /gmail/yahoo   │                   │  (Render)    │
│   background +   │       │  /email-sync         │                   │              │
│   bundled React  │       └──────────────────────┘                   └──────────────┘
│   dashboard)     │
└──────────────────┘
```
