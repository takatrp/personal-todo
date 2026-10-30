# Optional AI browser checks (mock only)

These tests are separate from `npm test` because Playwright/Chromium are optional prerequisites, not application dependencies. Use an existing Playwright installation resolvable by Node and an installed Chromium (or set `CHROMIUM_PATH`). No production credentials or account are needed.

From the repository root, terminal 1:

```sh
node node_modules/vite/bin/vite.js --config tests/ai-browser.config.ts
```

Terminal 2:

```sh
node tests/ai-browser.run.mjs
```

The Vite config intentionally does not load `.env`; it injects fake public configuration. Playwright intercepts the fake Supabase endpoint and blocks every non-local request. The harness uses invented titles and fake sessions, not a real user. The script checks title-and-goal payloads, confirmation-only editable/selectable append, deduplication, concurrent manual additions, cancellation/late replies, title/goal/logout/unmount/history invalidation, HTTP 401/429/503, timeout, failed save retention, and the 100-child bound. Screenshots are written to `output/playwright/` only when all scenarios pass.

This is a component integration harness, not full application or production authentication coverage. Actual modal/detail integration and live SQL/Edge Function remain separate checks.

## Current execution limit

In the current cloud workspace, Chromium could not launch (`socket() failed: Operation not permitted`). The escalation bootstrap itself failed (`bwrap` read-only mount error). No browser scenario or screenshot was verified here. The script syntax and focused ESLint checks were verified; run the browser commands in an environment that supports Chromium before publication.
