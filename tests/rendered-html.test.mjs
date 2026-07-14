import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("個人向けToDo画面をサーバーレンダリングする", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="ja"/i);
  assert.match(html, /<title>ととのうToDo｜個人タスク管理<\/title>/);
  assert.match(html, /今日のToDo/);
  assert.match(html, /新しいToDo/);
  assert.match(html, /この端末だけに保存/);
  assert.match(html, /期限超過/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("必須機能とレスポンシブ設計をソースに備える", async () => {
  const [app, css, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/todo-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(app, /createdAt: previousTask\?\.createdAt \?\? now/);
  assert.match(app, /type="datetime-local"/);
  assert.match(app, /依頼元/);
  assert.match(app, /依頼先/);
  assert.match(app, /ファイル添付/);
  assert.match(app, /indexedDB\.open/);
  assert.match(app, /MAX_FILE_SIZE/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(layout, /lang="ja"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
