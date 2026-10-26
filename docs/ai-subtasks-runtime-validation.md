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
