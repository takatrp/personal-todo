import assert from "node:assert/strict";
import test from "node:test";
import {
  AiSuggestionError, aiSuggestionErrorMessage, normalizeAiTitleKey,
  parseAiTitles, requestAiSubtasks, selectAiTitles,
} from "../app/ai-subtasks.ts";

const session = { access_token: "mock-token", user: { id: "mock-user" } };
const opts = () => ({
  title: "  親ToDo  ", userId: "mock-user", url: "https://example.supabase.co", publishableKey: "mock-public-key",
  getSession: async () => ({ data: { session }, error: null }), signal: new AbortController().signal,
});

test("normalizes compatibility characters, whitespace and case for duplicates", () => {
  assert.equal(normalizeAiTitleKey(" ＡＢＣ  資料 "), "abc 資料");
  assert.deepEqual(selectAiTitles(["ABC 資料", "新規", " 新規 ", "次"], ["ａｂｃ　資料"]), ["新規", "次"]);
});
test("enforces latest remaining slots, output count and title bounds", () => {
  assert.deepEqual(selectAiTitles(["a", "b"], Array.from({ length: 99 }, (_, i) => `existing${i}`)), ["a"]);
  assert.deepEqual(selectAiTitles(["a"], Array(100).fill("old")), []);
  assert.equal(selectAiTitles(Array.from({ length: 10 }, (_, i) => `${i}`), []).length, 8);
  assert.deepEqual(selectAiTitles(["", " ", "x".repeat(161), "line\nbreak", "valid"], []), ["valid"]);
});
test("rejects malformed model responses instead of guessing fields or truncating", () => {
  for (const value of [null, {}, { titles: [] }, { titles: [7] }, { titles: ["a".repeat(161)] }, { titles: Array(9).fill("x") }, { titles: ["a\u0000b"] }]) {
    assert.throws(() => parseAiTitles(value));
  }
  assert.deepEqual(parseAiTitles({ titles: [" 確認する "] }), ["確認する"]);
});
test("sends only title, goal and authenticated headers; no external API called", async () => {
  let calls = 0;
  const titles = await requestAiSubtasks({ ...opts(), goal: "  参加者全員で方針を決める\r\n次の行動を共有する  ", fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://example.supabase.co/functions/v1/suggest-subtasks");
    assert.deepEqual(JSON.parse(init.body), { title: "親ToDo", goal: "参加者全員で方針を決める\n次の行動を共有する" });
    assert.equal(init.headers.Authorization, "Bearer mock-token");
    assert.equal(init.headers.apikey, "mock-public-key");
    return Response.json({ titles: ["資料を確認"] });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(titles, ["資料を確認"]);
});
test("an omitted or empty goal still permits title-only suggestions", async () => {
  for (const goal of [undefined, "", "  \n\t "]) {
    await requestAiSubtasks({ ...opts(), goal, fetcher: async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), { title: "親ToDo", goal: "" });
      return Response.json({ titles: ["確認する"] });
    } });
  }
});
test("invalid or overlong goals never resolve a session or call the endpoint", async () => {
  for (const goal of [null, 42, "x".repeat(2001), "a\u0000b", "a\u0085b"]) {
    await assert.rejects(requestAiSubtasks({ ...opts(), goal,
      getSession: async () => assert.fail("must not resolve a session"),
      fetcher: async () => assert.fail("must not call endpoint"),
    }), (error) => error.status === 400);
  }
});
test("session missing, changed, error and input overlong never call endpoint", async () => {
  const forbiddenFetch = async () => assert.fail("must not call endpoint");
  for (const result of [{ data: { session: null }, error: null }, { data: { session: { ...session, user: { id: "other" } } }, error: null }, { data: { session }, error: Error("auth") }]) {
    await assert.rejects(requestAiSubtasks({ ...opts(), getSession: async () => result, fetcher: forbiddenFetch }), (error) => error.status === 401);
  }
  await assert.rejects(requestAiSubtasks({ ...opts(), title: "x".repeat(121), fetcher: forbiddenFetch }), (error) => error.status === 400);
});
test("abort before request or during session resolution never starts network", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestAiSubtasks({ ...opts(), signal: controller.signal }), { name: "AbortError" });
  const later = new AbortController();
  await assert.rejects(requestAiSubtasks({ ...opts(), signal: later.signal, getSession: async () => {
    later.abort(); return { data: { session }, error: null };
  }, fetcher: async () => assert.fail("must not send after cancellation") }), { name: "AbortError" });
});
test("HTTP errors expose only safe localized messages", async () => {
  for (const status of [401, 403, 429, 503, 504]) {
    await assert.rejects(requestAiSubtasks({ ...opts(), fetcher: async () => new Response("SECRET UPSTREAM ERROR", { status }) }), (error) => {
      assert.equal(error.status, status);
      assert.doesNotMatch(aiSuggestionErrorMessage(error), /SECRET/);
      return true;
    });
  }
  assert.match(aiSuggestionErrorMessage(new AiSuggestionError(429)), /利用上限/);
  assert.match(aiSuggestionErrorMessage(Error("SECRET")), /取得できませんでした/);
});
test("oversized response and invalid JSON fail closed", async () => {
  for (const body of ["x".repeat(16_385), "not json"]) {
    await assert.rejects(requestAiSubtasks({ ...opts(), fetcher: async () => new Response(body) }));
  }
});
