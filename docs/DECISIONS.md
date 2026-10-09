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
