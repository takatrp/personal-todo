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
  assert.match(html, /すべてのToDo/);
  assert.match(html, /タブを管理/);
  assert.match(html, /データ管理/);
  assert.match(html, /ゴミ箱/);
  assert.match(html, /<title>ととのうToDo｜個人タスク管理<\/title>/);
  assert.match(html, /ワークスペース/);
  assert.match(html, /ToDoを追加/);
  assert.match(html, /この端末に保存/);
  assert.match(html, /期限超過/);
  assert.match(html, /一覧/);
  assert.match(html, /かんばん/);
  assert.match(html, /ガント/);
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
  assert.match(app, /type="date"/);
  assert.match(app, /type="datetime-local"/);
  assert.match(app, /startHasTime: false/);
  assert.match(app, /dueHasTime: false/);
  assert.match(app, /function composeTaskDateValue/);
  assert.match(app, /時間も指定/);
  assert.match(css, /\.date-time-inputs/);
  assert.match(css, /\.time-toggle/);
  assert.match(app, /依頼元/);
  assert.match(app, /依頼先/);
  assert.match(app, /ファイル添付/);
  assert.match(app, /indexedDB\.open/);
  assert.match(app, /MAX_FILE_SIZE/);
  assert.match(app, /function handleCardPaste/);
  assert.match(app, /event\.clipboardData\.items/);
  assert.match(app, /filesToAttachments\(imageFiles, true\)/);
  assert.match(app, /貼り付け先：/);
  assert.match(app, /function restoreBackup/);
  assert.match(app, /blobToDataUrl/);
  assert.match(app, /deletedAt/);
  assert.match(app, /function undoLastDelete/);
  assert.match(app, /Notification\.requestPermission/);
  assert.match(app, /buildNextRecurringTask/);
  assert.match(app, /saveCurrentAsTemplate/);
  assert.match(app, /sortOrder/);
  assert.match(app, /function reorderTabs/);
  assert.match(app, /function handleTaskCardDrop/);
  assert.match(app, /function handleTaskTouchMove/);
  assert.match(app, /function setFloatingDragPreview/);
  assert.match(app, /event\.dataTransfer\.setDragImage/);
  assert.match(app, /className="drag-status"/);
  assert.match(app, /function dragTargetClass/);
  assert.match(app, /onTouchStart/);
  assert.match(app, /onDoubleClick/);
  assert.match(app, /title="ダブルクリックで詳細を編集"/);
  assert.match(app, /window\.setTimeout\(\(\) => openEditForm\(task\), 0\)/);
  assert.match(app, /event\.key === "F2"/);
  assert.match(app, /function handleTaskFormKeyDown/);
  assert.match(app, /\(!event\.ctrlKey && !event\.metaKey\)/);
  assert.match(app, /event\.currentTarget\.requestSubmit\(\)/);
  assert.match(app, /onKeyDown=\{handleTaskFormKeyDown\}/);
  assert.match(app, /aria-keyshortcuts="Control\+Enter Meta\+Enter"/);
  assert.match(app, /title="Ctrl＋Enterで保存"/);
  assert.match(app, /nativeEvent\.isComposing/);
  assert.match(app, /startAt: task\.startAt \?\? ""/);
  assert.match(app, /tabId: task\.tabId \?\? ""/);
  assert.match(app, /const DB_VERSION = 3/);
  assert.match(app, /type SubTask =/);
  assert.match(app, /subTasks: SubTask\[\]/);
  assert.match(app, /function subTaskProgress/);
  assert.match(app, /function addSubTask/);
  assert.match(app, /function toggleSubTask/);
  assert.match(app, /function deleteSubTask/);
  assert.match(app, /function addFormSubTask/);
  assert.match(app, /function updateFormSubTask/);
  assert.match(app, /subTasks: sortSubTasks\(task\.subTasks\)/);
  assert.match(app, /編集中の子ToDo進捗/);
  assert.match(app, /子ToDoの追加・変更も、ToDoと一緒にまとめて保存されます/);
  assert.match(app, /aria-label="ToDo作成・編集画面で新しい子ToDoを追加"/);
  assert.doesNotMatch(app, /\{editingId && \(\s*<section className="form-subtasks"/);
  assert.match(app, /子ToDo/);
  assert.match(app, /formatVersion: 2/);
  assert.match(app, /parsed\.formatVersion !== 1 && parsed\.formatVersion !== 2/);
  assert.match(app, /const TAB_STORE_NAME = "tabs"/);
  assert.match(app, /const TEMPLATE_STORE_NAME = "templates"/);
  assert.match(app, /removeTabAndUnassign/);
  assert.match(app, /function showAllTasks/);
  assert.match(app, /const workspaceTitle/);
  assert.match(app, /className={`workspace-grid/);
  assert.match(app, /task-table-header/);
  assert.match(app, /task-detail-panel/);
  assert.match(app, /@phosphor-icons\/web\/regular/);
  assert.match(app, /function createPhosphorIcon/);
  assert.match(app, /期限は開始日以降に設定してください/);
  assert.match(app, /moveTaskStatus/);
  assert.match(app, /handleKanbanDrop/);
  assert.match(app, /GANTT_DAYS = 14/);
  assert.match(app, /14日間の予定/);
  assert.match(css, /\.kanban-board/);
  assert.match(css, /\.gantt-chart/);
  assert.match(css, /\.scope-toolbar/);
  assert.match(css, /\.workspace-grid/);
  assert.match(css, /\.task-table-header/);
  assert.match(css, /\.task-detail-panel/);
  assert.match(css, /\.active-filter-chip/);
  assert.match(css, /@media \(max-width: 960px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.tab-modal/);
  assert.match(css, /\.paste-hint/);
  assert.match(css, /\.task-card:focus-within/);
  assert.match(css, /\.data-modal/);
  assert.match(css, /\.image-preview-modal/);
  assert.match(css, /\.template-picker/);
  assert.match(css, /\.inline-title-input/);
  assert.match(css, /\.task-drag-handle/);
  assert.match(css, /\.tab-drag-handle/);
  assert.match(css, /\.todo-drag-preview/);
  assert.match(css, /\.drag-over-before/);
  assert.match(css, /\.drag-status/);
  assert.match(css, /\.subtask-progress-badge/);
  assert.match(css, /\.detail-subtask-progress/);
  assert.match(css, /\.subtask-item/);
  assert.match(css, /\.form-subtasks/);
  assert.match(css, /\.form-subtask-row/);
  assert.match(css, /\.form-subtask-add/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(layout, /lang="ja"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
