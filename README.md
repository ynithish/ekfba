# EKFBA Card Manager

Personal credit & debit card intelligence app for India. Installable, offline-first Progressive Web App (PWA).
Ask *"₹15,000 at Croma — which card?"* and get the best card from your own wallet, with savings, rewards,
fee-waiver / lounge progress and how fresh the offer data is.

**Status:** Phase 1 (foundation) complete — wallet management, offline app shell, encrypted backup/restore.
See [docs/PROGRESS.md](docs/PROGRESS.md).

## Privacy in one paragraph
Your data stays in your phone's browser storage. The app never stores full card numbers, CVV, PIN, OTP or
banking passwords (it actively refuses them), has no analytics or third-party scripts, and never touches your
bank account. Backups are encrypted on the device with your passphrase. This repository contains **only code** —
no personal data — so it is safe for it to be public.

## Using the app
1. Open the app link on your phone (Chrome on Android, Safari on iPhone).
2. Install it: Android → menu ⋮ → **Install app**; iPhone → Share → **Add to Home Screen**.
3. **Cards → Add card** for each card you own (nickname and/or last 4 digits only).
4. **More → Settings & backup**: download an encrypted backup regularly; keep the passphrase safe.

## Project layout
```
index.html, manifest.webmanifest, sw.js   PWA entry, install metadata, offline service worker
precache.js                               generated list of files cached for offline use
src/core/      pure logic — money (paise), card validation, sensitive-data guard, crypto, backup format, schema
src/data/      IndexedDB wrapper (db.js) and repository (repo.js) — the only data access path
src/ui/        router, safe HTML templating, screens, styles
tests/         *.test.mjs unit tests (Node) and e2e_phase1.py browser test (headless Chromium)
tools/         precache.mjs — regenerates precache.js
docs/          architecture, decisions, schema, progress
```

## Development (done in Claude's cloud workspace — no laptop needed)
- No build step: plain ES modules served as-is.
- After changing any app file: `node tools/precache.mjs` (a unit test fails if you forget).
- Tests: `npm test` (unit) and `python3 tests/e2e_phase1.py` (browser, needs Playwright + Chromium).
- Money is always integer **paise**; dates are local `YYYY-MM-DD`.
- All interpolated HTML goes through `html``…`` which escapes values; never assign untrusted strings to `innerHTML` directly.

## Deployment (GitHub Pages)
1. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
2. The site appears at `https://<username>.github.io/ekfba/` within a minute or two; every push to `main` redeploys.
3. Installed apps pick up new versions automatically and show an **Update** prompt.

## Recovery
- Lost/replaced phone: install the app on the new phone → Settings → Restore → choose your encrypted backup → enter passphrase → **Replace**.
- Corrupted local data: Settings → Wipe this device, then restore from backup.
- Bad release: revert the commit on GitHub (web UI → commit → Revert); Pages redeploys the previous version.
