"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TaskStatus = "open" | "doing" | "waiting" | "done";
type ViewKey = "all" | "today" | "overdue" | "upcoming" | "done";

type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  data: Blob;
};

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueAt: string;
  tags: string[];
  requester: string;
  assignee: string;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  completedAt: string;
};

type TaskForm = {
  title: string;
  description: string;
  status: TaskStatus;
  dueAt: string;
  tags: string;
  requester: string;
  assignee: string;
  attachments: Attachment[];
};

const DB_NAME = "totonou-todo";
const DB_VERSION = 1;
const STORE_NAME = "tasks";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TASK_ATTACHMENT_SIZE = 20 * 1024 * 1024;

const initialForm: TaskForm = {
  title: "",
  description: "",
  status: "open",
  dueAt: "",
  tags: "",
  requester: "",
  assignee: "",
  attachments: [],
};

const statusLabels: Record<TaskStatus, string> = {
  open: "未着手",
  doing: "進行中",
  waiting: "確認待ち",
  done: "完了",
};

const viewLabels: Record<ViewKey, string> = {
  all: "すべてのToDo",
  today: "今日が期限",
  overdue: "期限超過",
  upcoming: "今後7日",
  done: "完了済み",
};

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readTasks(): Promise<Task[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve(request.result as Task[]);
    request.onerror = () => reject(request.error);
    request.transaction.oncomplete = () => database.close();
  });
}

async function writeTask(task: Task) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(task);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function removeTaskRecord(id: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function isSameLocalDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function localDayStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isComplete(task: Task) {
  return task.status === "done";
}

function isOverdue(task: Task, now = new Date()) {
  return Boolean(task.dueAt) && !isComplete(task) && new Date(task.dueAt) < now;
}

function isDueToday(task: Task, now = new Date()) {
  return Boolean(task.dueAt) && isSameLocalDay(new Date(task.dueAt), now);
}

function isUpcoming(task: Task, now = new Date()) {
  if (!task.dueAt || isComplete(task)) return false;
  const due = new Date(task.dueAt);
  const start = localDayStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 8);
  return due >= start && due < end;
}

function formatDateTime(value: string) {
  if (!value) return "期限なし";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toLocalInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dueLabel(task: Task) {
  if (!task.dueAt) return { label: "期限なし", tone: "neutral" };
  if (isOverdue(task)) return { label: `期限超過・${formatDateTime(task.dueAt)}`, tone: "danger" };
  if (isDueToday(task)) return { label: `今日・${formatDateTime(task.dueAt)}`, tone: "today" };
  return { label: formatDateTime(task.dueAt), tone: "normal" };
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[、,\n]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).slice(0, 10);
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((first, second) => {
    if (isComplete(first) !== isComplete(second)) return isComplete(first) ? 1 : -1;
    if (!first.dueAt && !second.dueAt) return second.createdAt.localeCompare(first.createdAt);
    if (!first.dueAt) return 1;
    if (!second.dueAt) return -1;
    return first.dueAt.localeCompare(second.dueAt);
  });
}

export function TodoApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeView, setActiveView] = useState<ViewKey>("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(initialForm);
  const [todayText, setTodayText] = useState("予定をひと目で整理");
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTodayText(
      new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(new Date()),
    );
    readTasks()
      .then((savedTasks) => setTasks(sortTasks(savedTasks)))
      .catch(() => setStorageError(true))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!isFormOpen) return;
    const focusTimer = window.setTimeout(() => titleInputRef.current?.focus(), 60);
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) setIsFormOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isFormOpen, isSaving]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(() => {
    const now = new Date();
    return {
      all: tasks.filter((task) => !isComplete(task)).length,
      today: tasks.filter((task) => isDueToday(task, now) && !isComplete(task)).length,
      overdue: tasks.filter((task) => isOverdue(task, now)).length,
      upcoming: tasks.filter((task) => isUpcoming(task, now)).length,
      done: tasks.filter(isComplete).length,
    };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ja-JP");
    const now = new Date();
    return sortTasks(tasks).filter((task) => {
      const matchesView =
        activeView === "all" ||
        (activeView === "today" && isDueToday(task, now) && !isComplete(task)) ||
        (activeView === "overdue" && isOverdue(task, now)) ||
        (activeView === "upcoming" && isUpcoming(task, now)) ||
        (activeView === "done" && isComplete(task));
      if (!matchesView) return false;
      if (!query) return true;
      return [
        task.title,
        task.description,
        task.requester,
        task.assignee,
        task.tags.join(" "),
      ]
        .join(" ")
        .toLocaleLowerCase("ja-JP")
        .includes(query);
    });
  }, [activeView, search, tasks]);

  function openCreateForm() {
    setEditingId(null);
    setForm(initialForm);
    setIsFormOpen(true);
  }

  function openEditForm(task: Task) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description,
      status: task.status,
      dueAt: toLocalInput(task.dueAt),
      tags: task.tags.join("、"),
      requester: task.requester,
      assignee: task.assignee,
      attachments: task.attachments,
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    if (isSaving) return;
    setIsFormOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      titleInputRef.current?.focus();
      return;
    }
    setIsSaving(true);
    const previousTask = editingId ? tasks.find((task) => task.id === editingId) : undefined;
    const now = new Date().toISOString();
    const nextStatus = form.status;
    const task: Task = {
      id: previousTask?.id ?? createId(),
      title,
      description: form.description.trim(),
      status: nextStatus,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : "",
      tags: parseTags(form.tags),
      requester: form.requester.trim(),
      assignee: form.assignee.trim(),
      attachments: form.attachments,
      createdAt: previousTask?.createdAt ?? now,
      updatedAt: now,
      completedAt:
        nextStatus === "done" ? previousTask?.completedAt || now : "",
    };

    try {
      await writeTask(task);
      setTasks((current) =>
        sortTasks([...current.filter((item) => item.id !== task.id), task]),
      );
      setIsFormOpen(false);
      setNotice(previousTask ? "ToDoを更新しました" : "ToDoを登録しました");
    } catch {
      setStorageError(true);
      setNotice("保存できませんでした。もう一度お試しください");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleComplete(task: Task) {
    const now = new Date().toISOString();
    const nextTask: Task = {
      ...task,
      status: task.status === "done" ? "open" : "done",
      completedAt: task.status === "done" ? "" : now,
      updatedAt: now,
    };
    setTasks((current) =>
      sortTasks(current.map((item) => (item.id === task.id ? nextTask : item))),
    );
    try {
      await writeTask(nextTask);
      setNotice(nextTask.status === "done" ? "完了にしました" : "未着手に戻しました");
    } catch {
      setTasks((current) =>
        sortTasks(current.map((item) => (item.id === task.id ? task : item))),
      );
      setNotice("変更を保存できませんでした");
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`「${task.title}」を削除しますか？`)) return;
    try {
      await removeTaskRecord(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setNotice("ToDoを削除しました");
    } catch {
      setNotice("削除できませんでした");
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    const oversized = incoming.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      setNotice("1ファイルは8MBまでです");
      return;
    }
    const currentSize = form.attachments.reduce((sum, file) => sum + file.size, 0);
    const incomingSize = incoming.reduce((sum, file) => sum + file.size, 0);
    if (currentSize + incomingSize > MAX_TASK_ATTACHMENT_SIZE) {
      setNotice("添付ファイルの合計は20MBまでです");
      return;
    }
    const attachments = incoming.map<Attachment>((file) => ({
      id: createId(),
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      data: file,
    }));
    setForm((current) => ({
      ...current,
      attachments: [...current.attachments, ...attachments].slice(0, 10),
    }));
  }

  function downloadAttachment(attachment: Attachment) {
    const url = URL.createObjectURL(attachment.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleQuickTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
  }

  const emptyTitle = search
    ? "検索に一致するToDoがありません"
    : `${viewLabels[activeView]}はありません`;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="ToDoの表示切替">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">と</span>
          <div>
            <strong>ととのうToDo</strong>
            <span>毎日の仕事を、軽やかに。</span>
          </div>
        </div>

        <nav className="side-nav">
          {(Object.keys(viewLabels) as ViewKey[]).map((view) => (
            <button
              className={activeView === view ? "nav-item active" : "nav-item"}
              key={view}
              onClick={() => setActiveView(view)}
              type="button"
            >
              <span className={`nav-dot ${view}`} aria-hidden="true" />
              <span>{viewLabels[view]}</span>
              <span className="nav-count">{counts[view]}</span>
            </button>
          ))}
        </nav>

        <div className="local-note">
          <span className="local-note-icon" aria-hidden="true">⌂</span>
          <div>
            <strong>この端末だけに保存</strong>
            <p>登録内容と添付は外部へ送信されません。</p>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">MY TASKS</p>
            <h1>今日のToDo</h1>
            <p className="today-label">{todayText}</p>
          </div>
          <button className="primary-button desktop-create" type="button" onClick={openCreateForm}>
            <span aria-hidden="true">＋</span> 新しいToDo
          </button>
        </header>

        <section className="stats-grid" aria-label="ToDoの集計">
          <button type="button" className="stat-card stat-today" onClick={() => setActiveView("today")}>
            <span>今日が期限</span>
            <strong>{counts.today}</strong>
            <small>件</small>
          </button>
          <button type="button" className="stat-card stat-overdue" onClick={() => setActiveView("overdue")}>
            <span>期限超過</span>
            <strong>{counts.overdue}</strong>
            <small>件</small>
          </button>
          <button type="button" className="stat-card stat-upcoming" onClick={() => setActiveView("upcoming")}>
            <span>今後7日</span>
            <strong>{counts.upcoming}</strong>
            <small>件</small>
          </button>
          <button type="button" className="stat-card stat-done" onClick={() => setActiveView("done")}>
            <span>完了済み</span>
            <strong>{counts.done}</strong>
            <small>件</small>
          </button>
        </section>

        <nav className="mobile-view-tabs" aria-label="ToDoの表示切替">
          {(Object.keys(viewLabels) as ViewKey[]).map((view) => (
            <button
              className={activeView === view ? "active" : ""}
              key={view}
              onClick={() => setActiveView(view)}
              type="button"
            >
              {viewLabels[view]} <span>{counts[view]}</span>
            </button>
          ))}
        </nav>

        <section className="task-section" aria-labelledby="task-list-heading">
          <div className="section-toolbar">
            <div>
              <h2 id="task-list-heading">{viewLabels[activeView]}</h2>
              <p>{visibleTasks.length}件を表示</p>
            </div>
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">ToDoを検索</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="タイトル・タグ・依頼元で検索"
              />
            </label>
          </div>

          {storageError && (
            <div className="error-banner" role="alert">
              端末内の保存領域を利用できません。ブラウザのプライベートモードや保存設定をご確認ください。
            </div>
          )}

          {isLoading ? (
            <div className="loading-list" role="status" aria-label="ToDoを読み込み中">
              <span />
              <span />
              <span />
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-symbol" aria-hidden="true">✓</div>
              <h3>{emptyTitle}</h3>
              <p>
                {activeView === "all" && !search
                  ? "まずは、気になっている仕事をひとつ登録してみましょう。"
                  : "表示条件を変えると、別のToDoを確認できます。"}
              </p>
              {activeView === "all" && !search && (
                <button className="secondary-button" type="button" onClick={openCreateForm}>
                  最初のToDoを登録
                </button>
              )}
            </div>
          ) : (
            <div className="task-list">
              {visibleTasks.map((task) => {
                const deadline = dueLabel(task);
                return (
                  <article className={isComplete(task) ? "task-card completed" : "task-card"} key={task.id}>
                    <button
                      type="button"
                      className="complete-button"
                      onClick={() => void toggleComplete(task)}
                      aria-label={isComplete(task) ? `${task.title}を未着手に戻す` : `${task.title}を完了にする`}
                    >
                      <span aria-hidden="true">✓</span>
                    </button>

                    <div className="task-body">
                      <div className="task-title-row">
                        <h3>{task.title}</h3>
                        <span className={`status-badge status-${task.status}`}>{statusLabels[task.status]}</span>
                      </div>
                      {task.description && <p className="task-description">{task.description}</p>}
                      {task.tags.length > 0 && (
                        <div className="tag-row" aria-label="タグ">
                          {task.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
                        </div>
                      )}

                      <div className="task-meta">
                        <span className={`due-label ${deadline.tone}`}>
                          <span aria-hidden="true">◷</span> {deadline.label}
                        </span>
                        {task.requester && <span><b>依頼元</b>{task.requester}</span>}
                        {task.assignee && <span><b>依頼先</b>{task.assignee}</span>}
                        <span className="created-label">登録 {formatCreatedAt(task.createdAt)}</span>
                      </div>

                      {task.attachments.length > 0 && (
                        <div className="attachment-row" aria-label="添付ファイル">
                          {task.attachments.map((attachment) => (
                            <button
                              type="button"
                              key={attachment.id}
                              onClick={() => downloadAttachment(attachment)}
                              title={`${attachment.name}を保存`}
                            >
                              <span aria-hidden="true">⌕</span>
                              <span>{attachment.name}</span>
                              <small>{formatBytes(attachment.size)}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="task-actions">
                      <button type="button" onClick={() => openEditForm(task)} aria-label={`${task.title}を編集`}>
                        編集
                      </button>
                      <button type="button" className="delete-action" onClick={() => void deleteTask(task)} aria-label={`${task.title}を削除`}>
                        削除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <button className="mobile-create-button" type="button" onClick={openCreateForm} aria-label="新しいToDoを登録">
        <span aria-hidden="true">＋</span>
      </button>

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeForm();
        }}>
          <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
            <header className="modal-header">
              <div>
                <p>{editingId ? "EDIT TASK" : "NEW TASK"}</p>
                <h2 id="task-form-title">{editingId ? "ToDoを編集" : "新しいToDo"}</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeForm} aria-label="閉じる">×</button>
            </header>

            <form onSubmit={handleSubmit}>
              <div className="form-scroll">
                <label className="form-field form-field-full">
                  <span>タイトル <b>必須</b></span>
                  <input
                    ref={titleInputRef}
                    type="text"
                    required
                    maxLength={120}
                    value={form.title}
                    onKeyDown={handleQuickTitleKeyDown}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="例：月次資料を確認する"
                  />
                </label>

                <label className="form-field form-field-full">
                  <span>メモ</span>
                  <textarea
                    rows={4}
                    maxLength={1000}
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="確認事項や手順を記録できます"
                  />
                </label>

                <div className="form-grid">
                  <label className="form-field">
                    <span>期限</span>
                    <input
                      type="datetime-local"
                      value={form.dueAt}
                      onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span>状態</span>
                    <select
                      value={form.status}
                      onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as TaskStatus }))}
                    >
                      {(Object.keys(statusLabels) as TaskStatus[]).map((status) => (
                        <option value={status} key={status}>{statusLabels[status]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>依頼元</span>
                    <input
                      type="text"
                      maxLength={80}
                      value={form.requester}
                      onChange={(event) => setForm((current) => ({ ...current, requester: event.target.value }))}
                      placeholder="例：田中様"
                    />
                  </label>
                  <label className="form-field">
                    <span>依頼先</span>
                    <input
                      type="text"
                      maxLength={80}
                      value={form.assignee}
                      onChange={(event) => setForm((current) => ({ ...current, assignee: event.target.value }))}
                      placeholder="例：自分、山田さん"
                    />
                  </label>
                </div>

                <label className="form-field form-field-full">
                  <span>タグ</span>
                  <input
                    type="text"
                    maxLength={200}
                    value={form.tags}
                    onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                    placeholder="例：月次、確認待ち、重要（読点で区切る）"
                  />
                  {parseTags(form.tags).length > 0 && (
                    <span className="tag-preview">
                      {parseTags(form.tags).map((tag) => <i key={tag}>#{tag}</i>)}
                    </span>
                  )}
                </label>

                <div className="form-field form-field-full">
                  <span>ファイル添付</span>
                  <label className="file-drop">
                    <input
                      type="file"
                      multiple
                      onChange={(event) => {
                        handleFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <strong><span aria-hidden="true">＋</span> ファイルを選ぶ</strong>
                    <small>1ファイル8MB・合計20MB・最大10件まで</small>
                  </label>
                  {form.attachments.length > 0 && (
                    <div className="selected-files">
                      {form.attachments.map((attachment) => (
                        <div key={attachment.id}>
                          <span><b>{attachment.name}</b><small>{formatBytes(attachment.size)}</small></span>
                          <button
                            type="button"
                            aria-label={`${attachment.name}を外す`}
                            onClick={() => setForm((current) => ({
                              ...current,
                              attachments: current.attachments.filter((item) => item.id !== attachment.id),
                            }))}
                          >
                            外す
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {editingId && (
                  <div className="created-info">
                    登録日時は自動記録され、編集しても変更されません。
                  </div>
                )}
              </div>

              <footer className="modal-footer">
                <button type="button" className="cancel-button" onClick={closeForm}>キャンセル</button>
                <button type="submit" className="primary-button" disabled={isSaving || !form.title.trim()}>
                  {isSaving ? "保存中…" : editingId ? "変更を保存" : "ToDoを登録"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
