# Local validation record — 2026-10-25

Base: `takatrp/personal-todo` commit `eae79b4629047ab9b85ad29e5c8f19a97ed74b53`. Fresh clean clone; no user work overwritten. Node24.19.0; lockfile install via `npm ci --ignore-scripts --cache /tmp/personal-todo-npm-cache`. No application dependency or lockfile changes.

## Passed

- `npm test`: application production build and 22 tests (9 mocked backend,8 mocked client/validation,3 append,2 existing server-render/source tests).
- `npm run build:pages`: static production bundle.
- Focused ESLint for all new TypeScript/JavaScript implementation/test files.
- `git diff --check`.
- Independent static review of client lifecycle, latest-state append, authentication/allowlist, data minimization, quota and SQL permissions. Found and fixed an out-of-order quota bucket rollback race by rejecting older minute/day buckets.

## Failed — confirmed pre-existing

- `npm run lint`:4 errors,9 warnings in existing `app/todo-app.tsx`. Errors:4 synchronous state updates inside effects. Baseline reproduced from a clean `git archive HEAD` with same dependencies/config. Generated `pages-dist` is now ignored by lint, like other build outputs.
- `npx tsc --noEmit`:5 errors; possibly-null IndexedDB `request.transaction` at current lines633/686/728; missing Cloudflare `Fetcher`/`D1Database` types in `worker/index.ts`6/7. Same five baseline failures (original lines631/684/726). No new-code type errors.

## Not verified / blocked

- Chromium launch was blocked by container socket permissions. Requested escalation failed during sandbox mount bootstrap; no workaround attempted. No browser test passes or screenshots. Optional13-scenario component harness and instructions: `tests/ai-browser.README.md`. Full application modal/detail integration and visual/mobile checks still needed before publication.
- No local PostgreSQL/Supabase CLI/Deno available: SQL privileges/concurrency and actual Edge runtime not executed. Static review is not runtime verification.
- No deployed gateway, real auth, real OpenAI/model compatibility or paid calls tested. Follow staging checks in `ai-subtasks.md` after approval.

## Scope

No existing secrets read, keys set, remote writes, PR, push, commit publication, migrations applied, deployment or real task transmission. SQL/config are proposed source files only. AI suggestions do not mutate tasks until user confirms locally; only a parent title is sent at explicit generation. Cross-device conflict handling still operates at parent-task granularity.

## Deployment-readiness follow-up

Read-only project/table/function metadata confirmed the target shared project and no new-object name collisions; no customer rows, Auth users or secret values were queried. Remote HEAD still matches the base commit. Renamed custom environment variables with TODO_ prefix and added mocked payload coverage for the explicitly proposed gpt-5.6-luna model (reasoning none). This validates request shape, not real model access or output quality. Secrets remain project-shared despite unique names; user approval and manual secure entry are required. No remote configuration changed.
