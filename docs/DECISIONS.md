# Architecture decision record

Each entry: decision, why, and what would make us revisit it.

## ADR-001 No build step; plain ES modules + Web Components-style screens (9 Oct 2026)
The development workspace cannot reach the npm registry, and the owner has no laptop. Plain modules run
directly in the browser, can be edited in GitHub's web editor, and are tested with Node's built-in runner.
Revisit if the UI grows enough that a framework clearly pays for itself and a build pipeline becomes available.

## ADR-002 Hosting on GitHub Pages, public repo (9 Oct 2026, owner agreed)
Free HTTPS (required for service workers), push-to-deploy, easy revert. Safe because no personal data is ever in the repo.
Alternative: Cloudflare Pages if a private repo becomes important.

## ADR-003 Rule extraction via Claude chat in the Project; app imports validated rule packs (9 Oct 2026, owner agreed)
No API keys in the app, no extra provider receives documents, uses existing Claude Pro. The app validates every pack
and shows a diff before activating. Revisit if in-app upload becomes important (would add a small server function + API key).

## ADR-004 Cloud sync deferred to Phase 6 via Google Drive app-data folder (9 Oct 2026, owner agreed)
Uses existing Google One storage, least-privilege `drive.appdata` scope, client-side encrypted. Until then, encrypted
backup files are the durable copy. Sync will exchange append-only events with UUIDs so merges cannot double-count.

## ADR-005 Money as integer paise; deterministic engine (9 Oct 2026)
Avoids floating-point errors. AI is used only to read documents; every calculation is plain, tested code.

## ADR-006 Never hard-delete cards; archive instead (9 Oct 2026)
Purchase history and milestone audits must keep pointing at the card that was used.

## ADR-007 Backups: AES-256-GCM, PBKDF2-SHA-256 310,000 iterations, passphrase ≥ 10 chars (9 Oct 2026)
Browser-native WebCrypto, no libraries. Import re-validates every record and re-runs the sensitive-data scan.

## ADR-008 Deliver as a Claude page first, Flutter app later (9 Oct 2026, owner decided)
Follows the NLNLALD roadmap: each module is its own claude.ai page while testing; one Flutter app merges them later.
Consequences: online only until the Flutter app; data in the page's database (owner-only read/write rules); the
GitHub Pages PWA is not deployed. Portability comes from the shared backup envelope, Rule Pack spec and tests.
Supersedes the hosting part of ADR-002 and the sync plan in ADR-004 for now.

## ADR-009 Page is built from the tested core (9 Oct 2026)
`tools/build-artifact.mjs` inlines src/core modules into artifact/page.html → artifact/dist/ekfba.html, so the page runs
exactly the code the unit tests cover. Republish by running the build and publishing the same file.

## ADR-010 Focus on spend tracking; Backup and Offers tabs removed (9 Oct 2026, owner decided)
The page opens on Spends (totals by period, card and category, milestones). Offers are visible on each card and inside
recommendations, so the separate Offers tab was redundant. The Backup tab was removed; data stays in the page's database
and Claude can export it on request (the NLNLALD backup envelope code remains in src/core for the Flutter move).
No Apple Pay or payment-method setting on cards.

## ADR-011 No backup in the Claude page; Google storage in the mobile app (9 Oct 2026, owner decided)
Purchases and cards stay in the Claude page's private database while testing. Backup and sync come with the
mobile app, using Google storage services (Phase 6 / Stage 3).

## ADR-012 Mobile app reads purchases from bank messages (9 Oct 2026, owner guideline; build at Stage 3)
Once the mobile app exists, purchases should be captured from bank transaction messages instead of typed in.
Design constraints, to be re-checked when Stage 3 starts:
- Parse on the phone with deterministic patterns per bank (amount, card last 4, merchant, date); never send
  message text to an AI provider. Ignore OTP and other non-transaction messages and never store them.
- Match the message's card last 4 to a wallet card; unknown last 4 → ask once. Message becomes a "pending
  review" purchase the owner confirms, with category suggested from the shop name (existing categoryForShop).
- Duplicate check (existing findDuplicates) so a message plus a manual entry don't double count.
- Android: SMS read permission. Google Play restricts it to default SMS apps, so a family-only app installed
  outside Play (or via internal testing) is the likely route; alternative is reading bank app notifications.
- iOS (owner decided): Shortcuts automation, provided it is secured as follows:
  - Trigger "When I get a message" limited to the banks' sender IDs (e.g. ICICI, Axis), with an OTP exclusion.
  - The only action hands the text to the app through an App Intent that runs on the phone: no web request,
    URL scheme, clipboard, file or shared note in between, so the message never leaves the device.
  - The app re-checks the sender and the bank pattern, drops OTP or anything that is not a transaction,
    stores only the parsed fields (never the raw message), and saves it as "pending review" so a spoofed
    message cannot add a purchase silently.
  - App data protected by the app lock and Google storage encryption from Phase 6.
  - We ship step-by-step setup instructions and a test message to check the automation.
