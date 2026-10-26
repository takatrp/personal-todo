import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, parseTitles } from '../supabase/functions/suggest-subtasks/handler.mjs';
const uid = '00000000-0000-4000-8000-000000000001';
const config = { TODO_AI_ALLOWED_ORIGINS: 'https://example.test', SUPABASE_URL: 'https://db.test',
  SUPABASE_ANON_KEY: 'public-test-key', SUPABASE_SERVICE_ROLE_KEY: 'server-test-key',
  TODO_OPENAI_API_KEY: 'openai-test-key', TODO_OPENAI_SUBTASK_MODEL: 'mock-model', TODO_AI_ALLOWED_USER_IDS: uid };
const request = (body = { title: '会議を準備する' }, headers = {}) => new Request('https://db.test/functions/v1/suggest-subtasks', {
  method: 'POST', headers: { origin: 'https://example.test', authorization: 'Bearer user-test-token', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const generated = (titles = ['議題を整理する', '資料を用意する']) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ titles }) }] }] });
function fixture(overrides = {}, responses = [{ id: uid }, true, generated()]) {
  const calls = [];
  const handler = createHandler({ env: (key) => ({ ...config, ...overrides })[key], fetchImpl: async (url, options) => {
    calls.push({ url, ...options });
    const response = responses[calls.length - 1];
    if (response instanceof Error) throw response;
    return response instanceof Response ? response : Response.json(response);
  } });
  return { calls, handler };
}
test('authenticated title-only generation has strict provider limits, no persistence and candidate-only response', async () => {
  const { handler, calls } = fixture();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { titles: ['議題を整理する', '資料を用意する'] });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].headers.Authorization, 'Bearer user-test-token');
  assert.deepEqual(JSON.parse(calls[1].body), { p_user_id: uid });
  const body = JSON.parse(calls[2].body);
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 2048);
  assert.equal(body.model, 'mock-model');
  assert.deepEqual(JSON.parse(body.input), { title: '会議を準備する' });
  assert.equal(body.text.format.strict, true);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('missing config, origin, auth and malformed/oversized input never calls provider', async () => {
  for (const [overrides, req, status] of [
    [{ TODO_OPENAI_API_KEY: '' }, request(), 503], [{ TODO_AI_ALLOWED_USER_IDS: '' }, request(), 503],
    [{}, request({}, { origin: 'https://attacker.test' }), 403],
    [{}, request({}, { authorization: '' }), 401],
    [{}, request({ title: 'x', notes: 'private' }), 400], [{}, request({ title: 'x'.repeat(121) }), 400],
    [{}, request({ title: '  ' }), 400], [{}, request({ title: 'a\nb' }), 400],
    [{}, request({ title: 'x'.repeat(3000) }), 400],
  ]) { const { handler, calls } = fixture(overrides); assert.equal((await handler(req)).status, status); assert.equal(calls.length, 0); }
});
test('auth and allowlist are enforced before quota and provider', async () => {
  for (const response of [Response.json({}, { status: 401 }), { id: '00000000-0000-4000-8000-000000000002' }, { id: uid, is_anonymous: true }]) {
    const { handler, calls } = fixture({}, [response]);
    assert.ok([401, 403].includes((await handler(request())).status));
    assert.equal(calls.length, 1);
  }
});
test('quota exhaustion or failure is fail-closed', async () => {
  for (const [quota, status] of [[false, 429], [null, 503], [Response.json({}, { status: 500 }), 503]]) {
    const { handler, calls } = fixture({}, [{ id: uid }, quota]);
    assert.equal((await handler(request())).status, status); assert.equal(calls.length, 2);
  }
});
test('untrusted output rejects duplicates, controls, extra fields, too many, empty or long titles', () => {
  for (const output of [{ titles: [] }, { titles: Array(9).fill('x') }, { titles: ['Ａ', 'a'] }, { titles: ['x\ny'] },
    { titles: ['x'.repeat(161)] }, { titles: [' '] }, { titles: [42] }, { titles: ['x'], extra: 1 }]) assert.throws(() => parseTitles(output));
});
test('provider errors, refusal and incomplete output expose no provider body', async () => {
  for (const [output, status] of [[Response.json({ secret: 'hidden' }, { status: 429 }), 429],
    [Response.json({ secret: 'hidden' }, { status: 401 }), 502], [{ ...generated(), status: 'incomplete' }, 502],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'hidden' }] }] }, 502],
    [generated(['x', 'x']), 502], [new Error('secret'), 502]]) {
    const { handler } = fixture({}, [{ id: uid }, true, output]);
    const response = await handler(request()); assert.equal(response.status, status);
    assert.ok(!JSON.stringify(await response.json()).includes('hidden'));
  }
});
test('timeout aborts backend work and does not retry', async () => {
  let calls = 0;
  const handler = createHandler({ env: (key) => config[key], timeoutMs: 5, fetchImpl: async (_url, { signal }) => {
    calls++; return await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  assert.equal((await handler(request())).status, 504); assert.equal(calls, 1);
});
test('preflight is origin-restricted and never calls external services', async () => {
  const { handler, calls } = fixture();
  const response = await handler(new Request('https://db.test', { method: 'OPTIONS', headers: { origin: 'https://example.test' } }));
  assert.equal(response.status, 204); assert.equal(calls.length, 0);
});
test('dedicated ToDo config does not fall back to shared secrets; proposed model disables reasoning', async () => {
  const disabled = fixture({ TODO_OPENAI_API_KEY: '', OPENAI_API_KEY: 'unrelated-shared-key' });
  assert.equal((await disabled.handler(request())).status, 503);
  assert.equal(disabled.calls.length, 0);
  const proposed = fixture({ TODO_OPENAI_SUBTASK_MODEL: 'gpt-5.6-luna' });
  assert.equal((await proposed.handler(request())).status, 200);
  const body = JSON.parse(proposed.calls[2].body);
  assert.equal(body.model, 'gpt-5.6-luna');
  assert.deepEqual(body.reasoning, { effort: 'none' });
  assert.equal(body.max_output_tokens, 2048);
});
