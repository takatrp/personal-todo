# Approved backend setup — 2026-10-25 UTC

Target: `junkai-junbi` / `lmuofqshnasvcofmmivf` only.

After explicit approval for the isolated ToDo AI/quota setup:

- Applied migration `add_todo_ai_quota` from `supabase/ai-subtasks.sql`.
- Deployed new Edge Function `suggest-subtasks`, version1, `verify_jwt=true`.
- Existing meeting-support Function, ToDo/customer data and existing policies were not changed.
- Verified quota table RLS enabled; anon/authenticated have no table or RPC access; service_role has required access.
- Real DB tests: sequential minute cap true,true,true,false; daily cap denies; future stored bucket denies older request. Tests rolled back.
- Four concurrent requests on a synthetic quota ID returned exactly3 allowed/1 denied. Synthetic row removed; zero remaining confirmed. This was DB-only, not an OpenAI call.
- Unauthenticated request to deployed Function returns HTTP401 at gateway.
- Existing project security warnings were present before setup and left unchanged: mutable search_path on set_updated_at; rls_auto_enable SECURITY DEFINER callable by anon/authenticated; leaked-password protection disabled. New RLS/no-policy informational notice is intentional for a service-only quota table.

## Outstanding

- User confirmed all four dedicated server settings saved on2026-10-26. No secret values were read or set by this task.
- Paid OpenAI test count:0 of maximum3 approved. Requires configuration readiness and the user's authenticated session, without creating credentials or bypassing allowlist.
- Connected-PC browser QA completed on2026-10-26 using mocked responses and isolated synthetic data. Verified create/edit/detail flows, editable selected candidates, manual-child preservation, save/reopen, cancellation discarding changes, parent switching, and existing completion-state preservation. Exact application source matched the reviewed patch; test harness stayed outside the repository. Earlier cloud-browser limitations were not bypassed.
- Frontend publication is authorized after these checks. Real authenticated OpenAI generation remains a separate post-publication test, maximum3 dummy calls.

This supplements the earlier local-only validation record; it does not imply production model quality or full app end-to-end validation.

## Goal context update — 2026-10-30 JST

- Added the optional persisted `goal` field (up to 2,000 characters) below the title in create/edit forms and the detail panel. Legacy tasks/templates default to an empty goal; existing JSON-based cloud and backup storage carry the field without a schema change.
- The client sends only `{ title, goal }` to the existing Function. Goal changes cancel pending suggestions and clear previous candidates. The Function remains compatible with older `{ title }` requests.
- Deployed `suggest-subtasks` version 4 with `verify_jwt=true`; downloaded source matches the tested handler and entrypoint. Existing Auth, quota, model and secret settings were preserved.
- `npm run test`: 30 tests passed, including title/goal payload validation and server prompt coverage. Application and GitHub Pages builds passed.
- Standalone TypeScript checking still reports the existing three nullable IndexedDB transaction accesses and two missing Worker binding types. No diagnostic concerns the added goal field or AI request changes.
- Mock browser suite: 15 scenarios passed, including goal edits, cancellation, late results and mobile overflow. Full application checks passed for field placement, new registration, Ctrl+Enter, detail autosave, reload, edit and template persistence, and mobile layout.
- Browser checks used isolated synthetic data and blocked non-local requests. No customer task or attachment was sent to OpenAI, and no paid generation was performed during this update. Live model output quality was not re-evaluated.
