"use client";

import {
  ClipboardEvent,
  CSSProperties,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TaskStatus = "open" | "doing" | "waiting" | "done";
type ViewKey = "all" | "today" | "overdue" | "upcoming" | "done";
type DisplayMode = "list" | "kanban" | "gantt";

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
  startAt: string;
  dueAt: string;
  tags: string[];
  tabId: string;
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
  startAt: string;
  dueAt: string;
  tags: string;
  tabId: string;
  requester: string;
  assignee: string;
  attachments: Attachment[];
};

type TodoTab = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = "totonou-todo";
const DB_VERSION = 2;
const TASK_STORE_NAME = "tasks";
const TAB_STORE_NAME = "tabs";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TASK_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const GANTT_DAYS = 14;

const initialForm: TaskForm = {
  title: "",
  description: "",
  status: "open",
  startAt: "",
  dueAt: "",
  tags: "",
  tabId: "",
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
      if (!database.objectStoreNames.contains(TASK_STORE_NAME)) {
        database.createObjectStore(TASK_STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(TAB_STORE_NAME)) {
        database.createObjectStore(TAB_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("データ更新がほかの画面で使用中です"));
  });
}

async function readTasks(): Promise<Task[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(TASK_STORE_NAME, "readonly")
      .objectStore(TASK_STORE_NAME)
      .getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as Task[]).map((task) => ({
          ...task,
          startAt: task.startAt ?? "",
          tabId: task.tabId ?? "",
          attachments: task.attachments ?? [],
        })),
      );
    request.onerror = () => reject(request.error);
    request.transaction.oncomplete = () => database.close();
  });
}

async function writeTask(task: Task) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE_NAME, "readwrite");
    transaction.objectStore(TASK_STORE_NAME).put(task);
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
    const transaction = database.transaction(TASK_STORE_NAME, "readwrite");
    transaction.objectStore(TASK_STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function readTabs(): Promise<TodoTab[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(TAB_STORE_NAME, "readonly")
      .objectStore(TAB_STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve((request.result as TodoTab[]).sort((first, second) =>
      first.createdAt.localeCompare(second.createdAt),
    ));
    request.onerror = () => reject(request.error);
    request.transaction.oncomplete = () => database.close();
  });
}

async function writeTab(tab: TodoTab) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TAB_STORE_NAME, "readwrite");
    transaction.objectStore(TAB_STORE_NAME).put(tab);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function removeTabAndUnassign(tabId: string, tasksToUpdate: Task[]) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([TAB_STORE_NAME, TASK_STORE_NAME], "readwrite");
    transaction.objectStore(TAB_STORE_NAME).delete(tabId);
    const taskStore = transaction.objectStore(TASK_STORE_NAME);
    tasksToUpdate.forEach((task) => taskStore.put(task));
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

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromLocalDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addLocalDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function localDayDifference(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / 86_400_000);
}

function formatGanttDay(date: Date) {
  return {
    day: new Intl.DateTimeFormat("ja-JP", { day: "numeric" }).format(date),
    weekday: new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(date),
  };
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

function attachmentLimitMessage(existing: Attachment[], incoming: File[]) {
  if (existing.length + incoming.length > 10) return "添付ファイルは10件までです";
  if (incoming.some((file) => file.size > MAX_FILE_SIZE)) return "1ファイルは8MBまでです";
  const currentSize = existing.reduce((sum, file) => sum + file.size, 0);
  const incomingSize = incoming.reduce((sum, file) => sum + file.size, 0);
  if (currentSize + incomingSize > MAX_TASK_ATTACHMENT_SIZE) {
    return "添付ファイルの合計は20MBまでです";
  }
  return "";
}

function screenshotName(file: File, index: number) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "_",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const subtype = file.type.split("/")[1]?.toLowerCase() || "png";
  const extension = subtype === "jpeg" ? "jpg" : subtype.replace(/[^a-z0-9]/g, "") || "png";
  return `スクリーンショット_${stamp}${index > 0 ? `_${index + 1}` : ""}.${extension}`;
}

function filesToAttachments(files: File[], renameAsScreenshot = false) {
  return files.map<Attachment>((file, index) => ({
    id: createId(),
    name: renameAsScreenshot ? screenshotName(file, index) : file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    data: file,
  }));
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

function sortTabs(tabs: TodoTab[]) {
  return [...tabs].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

export function TodoApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tabs, setTabs] = useState<TodoTab[]>([]);
  const [activeView, setActiveView] = useState<ViewKey>("all");
  const [activeTabId, setActiveTabId] = useState("all");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("list");
  const [timelineStart, setTimelineStart] = useState("");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [pastingTaskId, setPastingTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTabManagerOpen, setIsTabManagerOpen] = useState(false);
  const [isSavingTab, setIsSavingTab] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabDraft, setTabDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(initialForm);
  const [todayText, setTodayText] = useState("予定をひと目で整理");
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tabInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedDisplayMode = window.localStorage.getItem("totonou-display-mode");
    if (savedDisplayMode === "list" || savedDisplayMode === "kanban" || savedDisplayMode === "gantt") {
      setDisplayMode(savedDisplayMode);
    }
    setTimelineStart(toLocalDateKey(localDayStart()));
    setTodayText(
      new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(new Date()),
    );
    Promise.all([readTasks(), readTabs()])
      .then(([savedTasks, savedTabs]) => {
        setTasks(sortTasks(savedTasks));
        setTabs(savedTabs);
      })
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
    if (!isTabManagerOpen) return;
    const focusTimer = window.setTimeout(() => tabInputRef.current?.focus(), 60);
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !isSavingTab) setIsTabManagerOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isTabManagerOpen, isSavingTab]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [activeTabId, tabs],
  );

  const tabNameById = useMemo(
    () => new Map(tabs.map((tab) => [tab.id, tab.name])),
    [tabs],
  );

  const tabScopedTasks = useMemo(
    () => activeTabId === "all" ? tasks : tasks.filter((task) => task.tabId === activeTabId),
    [activeTabId, tasks],
  );

  const counts = useMemo(() => {
    const now = new Date();
    return {
      all: tabScopedTasks.length,
      today: tabScopedTasks.filter((task) => isDueToday(task, now) && !isComplete(task)).length,
      overdue: tabScopedTasks.filter((task) => isOverdue(task, now)).length,
      upcoming: tabScopedTasks.filter((task) => isUpcoming(task, now)).length,
      done: tabScopedTasks.filter(isComplete).length,
    };
  }, [tabScopedTasks]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ja-JP");
    const now = new Date();
    return sortTasks(tabScopedTasks).filter((task) => {
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
        tabNameById.get(task.tabId) ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("ja-JP")
        .includes(query);
    });
  }, [activeView, search, tabNameById, tabScopedTasks]);

  const timelineDays = useMemo(() => {
    if (!timelineStart) return [];
    const start = fromLocalDateKey(timelineStart);
    return Array.from({ length: GANTT_DAYS }, (_, index) => addLocalDays(start, index));
  }, [timelineStart]);

  function switchDisplayMode(mode: DisplayMode) {
    setDisplayMode(mode);
    window.localStorage.setItem("totonou-display-mode", mode);
  }

  function showAllTasks() {
    setActiveTabId("all");
    setActiveView("all");
    setSearch("");
  }

  function openTabManager() {
    setEditingTabId(null);
    setTabDraft("");
    setIsTabManagerOpen(true);
  }

  function beginEditTab(tab: TodoTab) {
    setEditingTabId(tab.id);
    setTabDraft(tab.name);
    window.setTimeout(() => tabInputRef.current?.focus(), 0);
  }

  async function handleTabSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = tabDraft.trim();
    if (!name) {
      tabInputRef.current?.focus();
      return;
    }
    const normalizedName = name.toLocaleLowerCase("ja-JP");
    const hasDuplicate = tabs.some((tab) =>
      tab.id !== editingTabId && tab.name.toLocaleLowerCase("ja-JP") === normalizedName,
    );
    if (hasDuplicate) {
      setNotice("同じ名前のタブがすでにあります");
      tabInputRef.current?.focus();
      return;
    }

    const previousTab = editingTabId ? tabs.find((tab) => tab.id === editingTabId) : undefined;
    const now = new Date().toISOString();
    const tab: TodoTab = {
      id: previousTab?.id ?? createId(),
      name,
      createdAt: previousTab?.createdAt ?? now,
      updatedAt: now,
    };
    setIsSavingTab(true);
    try {
      await writeTab(tab);
      setTabs((current) => sortTabs([...current.filter((item) => item.id !== tab.id), tab]));
      setEditingTabId(null);
      setTabDraft("");
      setNotice(previousTab ? "タブ名を変更しました" : "タブを追加しました");
    } catch {
      setStorageError(true);
      setNotice("タブを保存できませんでした。画面を再読み込みしてお試しください");
    } finally {
      setIsSavingTab(false);
    }
  }

  async function deleteTab(tab: TodoTab) {
    const taskCount = tasks.filter((task) => task.tabId === tab.id).length;
    const message = taskCount > 0
      ? `タブ「${tab.name}」を削除しますか？\n所属する${taskCount}件のToDoは削除されず、未分類に戻ります。`
      : `タブ「${tab.name}」を削除しますか？`;
    if (!window.confirm(message)) return;

    const now = new Date().toISOString();
    const updatedTasks = tasks.map((task) => task.tabId === tab.id
      ? { ...task, tabId: "", updatedAt: now }
      : task);
    const tasksToUpdate = updatedTasks.filter((task) => task.tabId === "" && tasks.some((item) =>
      item.id === task.id && item.tabId === tab.id,
    ));
    setIsSavingTab(true);
    try {
      await removeTabAndUnassign(tab.id, tasksToUpdate);
      setTabs((current) => current.filter((item) => item.id !== tab.id));
      setTasks(sortTasks(updatedTasks));
      if (activeTabId === tab.id) setActiveTabId("all");
      if (editingTabId === tab.id) {
        setEditingTabId(null);
        setTabDraft("");
      }
      setNotice("タブを削除しました。ToDoは未分類に戻しました");
    } catch {
      setStorageError(true);
      setNotice("タブを削除できませんでした。もう一度お試しください");
    } finally {
      setIsSavingTab(false);
    }
  }

  function openCreateForm() {
    setEditingId(null);
    setForm({ ...initialForm, tabId: activeTabId === "all" ? "" : activeTabId });
    setIsFormOpen(true);
  }

  function openCreateForStatus(status: TaskStatus) {
    setEditingId(null);
    setForm({
      ...initialForm,
      status,
      tabId: activeTabId === "all" ? "" : activeTabId,
    });
    setIsFormOpen(true);
  }

  function openEditForm(task: Task) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description,
      status: task.status,
      startAt: toLocalInput(task.startAt),
      dueAt: toLocalInput(task.dueAt),
      tags: task.tags.join("、"),
      tabId: tabs.some((tab) => tab.id === task.tabId) ? task.tabId : "",
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
    const previousTask = editingId ? tasks.find((task) => task.id === editingId) : undefined;
    if (form.startAt && form.dueAt && new Date(form.startAt) > new Date(form.dueAt)) {
      setNotice("期限は開始日時以降に設定してください");
      return;
    }
    setIsSaving(true);
    const now = new Date().toISOString();
    const nextStatus = form.status;
    const task: Task = {
      id: previousTask?.id ?? createId(),
      title,
      description: form.description.trim(),
      status: nextStatus,
      startAt: form.startAt ? new Date(form.startAt).toISOString() : "",
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : "",
      tags: parseTags(form.tags),
      tabId: tabs.some((tab) => tab.id === form.tabId) ? form.tabId : "",
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

  async function moveTaskStatus(task: Task, nextStatus: TaskStatus) {
    if (task.status === nextStatus) return;
    const now = new Date().toISOString();
    const nextTask: Task = {
      ...task,
      status: nextStatus,
      completedAt: nextStatus === "done" ? task.completedAt || now : "",
      updatedAt: now,
    };
    setTasks((current) =>
      sortTasks(current.map((item) => (item.id === task.id ? nextTask : item))),
    );
    try {
      await writeTask(nextTask);
      setNotice(`「${statusLabels[nextStatus]}」へ移動しました`);
    } catch {
      setTasks((current) =>
        sortTasks(current.map((item) => (item.id === task.id ? task : item))),
      );
      setNotice("変更を保存できませんでした");
    }
  }

  async function toggleComplete(task: Task) {
    await moveTaskStatus(task, task.status === "done" ? "open" : "done");
  }

  function handleKanbanDrop(event: DragEvent<HTMLDivElement>, status: TaskStatus) {
    event.preventDefault();
    const task = tasks.find((item) => item.id === draggingTaskId);
    setDraggingTaskId(null);
    if (task) void moveTaskStatus(task, status);
  }

  function shiftTimeline(days: number) {
    if (!timelineStart) return;
    setTimelineStart(toLocalDateKey(addLocalDays(fromLocalDateKey(timelineStart), days)));
  }

  function resetTimeline() {
    setTimelineStart(toLocalDateKey(localDayStart()));
  }

  function getGanttBarStyle(task: Task): CSSProperties | null {
    if (!timelineStart || !task.dueAt) return null;
    const rangeStart = fromLocalDateKey(timelineStart);
    const taskStart = localDayStart(new Date(task.startAt || task.dueAt));
    const taskEnd = localDayStart(new Date(task.dueAt));
    const rawStart = localDayDifference(rangeStart, taskStart);
    const rawEnd = localDayDifference(rangeStart, taskEnd);
    if (rawEnd < 0 || rawStart >= GANTT_DAYS) return null;
    const clippedStart = Math.max(0, rawStart);
    const clippedEnd = Math.min(GANTT_DAYS - 1, Math.max(rawStart, rawEnd));
    return {
      gridColumn: `${clippedStart + 1} / span ${clippedEnd - clippedStart + 1}`,
    };
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
    const limitMessage = attachmentLimitMessage(form.attachments, incoming);
    if (limitMessage) {
      setNotice(limitMessage);
      return;
    }
    const attachments = filesToAttachments(incoming);
    setForm((current) => ({
      ...current,
      attachments: [...current.attachments, ...attachments],
    }));
  }

  async function handleCardPaste(event: ClipboardEvent<HTMLElement>, task: Task) {
    if (pastingTaskId) return;
    const itemFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const imageFiles = itemFiles.length > 0
      ? itemFiles
      : Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    const limitMessage = attachmentLimitMessage(task.attachments, imageFiles);
    if (limitMessage) {
      setNotice(limitMessage);
      return;
    }

    const pastedAttachments = filesToAttachments(imageFiles, true);
    const nextTask: Task = {
      ...task,
      attachments: [...task.attachments, ...pastedAttachments],
      updatedAt: new Date().toISOString(),
    };
    setPastingTaskId(task.id);
    try {
      await writeTask(nextTask);
      setTasks((current) => sortTasks(current.map((item) => item.id === task.id ? nextTask : item)));
      setNotice(`${pastedAttachments.length}枚の画像を「${task.title}」に添付しました`);
    } catch {
      setStorageError(true);
      setNotice("画像を添付できませんでした。もう一度お試しください");
    } finally {
      setPastingTaskId(null);
    }
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

  const sectionTitle = activeTab ? `${activeTab.name}・${viewLabels[activeView]}` : viewLabels[activeView];
  const emptyTitle = search
    ? "検索に一致するToDoがありません"
    : `${sectionTitle}はありません`;

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

        <section className="scope-toolbar" aria-label="ToDoのタブ切替">
          <button
            type="button"
            className={activeTabId === "all" && activeView === "all" && !search ? "all-tasks-button active" : "all-tasks-button"}
            onClick={showAllTasks}
            aria-pressed={activeTabId === "all" && activeView === "all" && !search}
          >
            <span aria-hidden="true">☷</span>
            <strong>すべてのToDo</strong>
            <small>{tasks.length}件</small>
          </button>
          <nav className="custom-tab-list" aria-label="カスタムタブ">
            {tabs.length === 0 ? (
              <span className="tabs-empty-hint">タブを追加すると、仕事ごとに切り替えられます</span>
            ) : tabs.map((tab) => {
              const tabCount = tasks.filter((task) => task.tabId === tab.id).length;
              return (
                <button
                  type="button"
                  className={activeTabId === tab.id ? "custom-tab active" : "custom-tab"}
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  aria-pressed={activeTabId === tab.id}
                >
                  <span>{tab.name}</span>
                  <small>{tabCount}</small>
                </button>
              );
            })}
          </nav>
          <button type="button" className="manage-tabs-button" onClick={openTabManager}>
            <span aria-hidden="true">＋</span> タブ管理
          </button>
        </section>

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
              <h2 id="task-list-heading">{sectionTitle}</h2>
              <p>{visibleTasks.length}件を表示</p>
            </div>
            <div className="toolbar-actions">
              <div className="display-switch" role="group" aria-label="表示方法">
                <button
                  type="button"
                  className={displayMode === "list" ? "active" : ""}
                  onClick={() => switchDisplayMode("list")}
                >
                  <span aria-hidden="true">☷</span> 一覧
                </button>
                <button
                  type="button"
                  className={displayMode === "kanban" ? "active" : ""}
                  onClick={() => switchDisplayMode("kanban")}
                >
                  <span aria-hidden="true">▥</span> かんばん
                </button>
                <button
                  type="button"
                  className={displayMode === "gantt" ? "active" : ""}
                  onClick={() => switchDisplayMode("gantt")}
                >
                  <span aria-hidden="true">▬</span> ガント
                </button>
              </div>
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <span className="sr-only">ToDoを検索</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="タイトル・タグ・タブ・依頼元で検索"
                />
              </label>
            </div>
          </div>

          {storageError && (
            <div className="error-banner" role="alert">
              端末内の保存領域を利用できません。ブラウザのプライベートモードや保存設定をご確認ください。
            </div>
          )}
          {!isLoading && visibleTasks.length > 0 && displayMode === "kanban" && (
            <div className="kanban-wrap">
              <p className="view-hint">カードは期限順です。PCでは列へドラッグ、スマホではカード内の状態から移動できます。</p>
              <div className="kanban-board" aria-label="かんばんボード">
                {(Object.keys(statusLabels) as TaskStatus[]).map((status) => {
                  const columnTasks = visibleTasks.filter((task) => task.status === status);
                  return (
                    <div
                      className={`kanban-column kanban-${status}`}
                      key={status}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => handleKanbanDrop(event, status)}
                    >
                      <header className="kanban-column-header">
                        <span className={`kanban-status-dot status-${status}`} aria-hidden="true" />
                        <h3>{statusLabels[status]}</h3>
                        <strong>{columnTasks.length}</strong>
                      </header>
                      <div className="kanban-cards">
                        {columnTasks.map((task) => {
                          const deadline = dueLabel(task);
                          return (
                            <article
                              className={`kanban-card${draggingTaskId === task.id ? " dragging" : ""}${pastingTaskId === task.id ? " pasting" : ""}`}
                              draggable
                              key={task.id}
                              tabIndex={0}
                              onPaste={(event) => void handleCardPaste(event, task)}
                              onDragStart={(event) => {
                                setDraggingTaskId(task.id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", task.id);
                              }}
                              onDragEnd={() => setDraggingTaskId(null)}
                            >
                              <button className="kanban-card-title" type="button" onClick={() => openEditForm(task)}>
                                {task.title}
                              </button>
                              {task.tags.length > 0 && (
                                <div className="tag-row">
                                  {task.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
                                </div>
                              )}
                              {task.tabId && tabNameById.has(task.tabId) && (
                                <span className="task-tab-badge">▣ {tabNameById.get(task.tabId)}</span>
                              )}
                              {task.description && <p>{task.description}</p>}
                              <div className="kanban-card-meta">
                                <span className={`due-label ${deadline.tone}`}>◷ {deadline.label}</span>
                                {task.assignee && <span>担当 {task.assignee}</span>}
                                {task.attachments.length > 0 && <span>添付 {task.attachments.length}件</span>}
                              </div>
                              <span className="paste-hint">
                                {pastingTaskId === task.id ? "画像を添付中…" : `貼り付け先：${task.title}（Ctrl＋V）`}
                              </span>
                              <label className="kanban-move">
                                <span>状態を変更</span>
                                <select
                                  aria-label={`${task.title}の状態を変更`}
                                  value={task.status}
                                  onChange={(event) => void moveTaskStatus(task, event.target.value as TaskStatus)}
                                >
                                  {(Object.keys(statusLabels) as TaskStatus[]).map((option) => (
                                    <option value={option} key={option}>{statusLabels[option]}</option>
                                  ))}
                                </select>
                              </label>
                            </article>
                          );
                        })}
                        {columnTasks.length === 0 && (
                          <div className="kanban-empty">カードをここへ移動できます</div>
                        )}
                      </div>
                      <button className="kanban-add" type="button" onClick={() => openCreateForStatus(status)}>
                        ＋ ToDoを追加
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!isLoading && visibleTasks.length > 0 && displayMode === "gantt" && (
            <div className="gantt-view">
              <div className="gantt-toolbar">
                <div>
                  <strong>14日間の予定</strong>
                  <span>
                    {timelineDays.length > 0
                      ? `${timelineDays[0].getMonth() + 1}/${timelineDays[0].getDate()}〜${timelineDays[timelineDays.length - 1].getMonth() + 1}/${timelineDays[timelineDays.length - 1].getDate()}`
                      : "日付を準備中"}
                  </span>
                </div>
                <div className="gantt-nav" aria-label="ガントチャートの期間移動">
                  <button type="button" onClick={() => shiftTimeline(-GANTT_DAYS)} aria-label="前の14日">‹</button>
                  <button type="button" onClick={resetTimeline}>今日</button>
                  <button type="button" onClick={() => shiftTimeline(GANTT_DAYS)} aria-label="次の14日">›</button>
                </div>
              </div>
              <div className="gantt-scroll">
                <div className="gantt-chart" style={{ "--gantt-days": GANTT_DAYS } as CSSProperties}>
                  <div className="gantt-header-row">
                    <div className="gantt-task-heading">ToDo</div>
                    <div className="gantt-days-heading">
                      {timelineDays.map((day) => {
                        const label = formatGanttDay(day);
                        const isToday = isSameLocalDay(day, new Date());
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        return (
                          <div className={`${isToday ? "today " : ""}${isWeekend ? "weekend" : ""}`} key={toLocalDateKey(day)}>
                            <strong>{label.day}</strong>
                            <span>{label.weekday}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {visibleTasks.map((task) => {
                    const barStyle = getGanttBarStyle(task);
                    return (
                      <div className="gantt-row" key={task.id}>
                        <button className="gantt-task-cell" type="button" onClick={() => openEditForm(task)}>
                          <span><i className={`status-${task.status}`} />{task.title}</span>
                          <small>{task.dueAt ? `期限 ${formatDateTime(task.dueAt)}` : "期限未設定"}</small>
                        </button>
                        <div className="gantt-calendar">
                          {timelineDays.map((day, index) => (
                            <div
                              className={`gantt-day-cell ${isSameLocalDay(day, new Date()) ? "today" : ""} ${day.getDay() === 0 || day.getDay() === 6 ? "weekend" : ""}`}
                              key={toLocalDateKey(day)}
                              style={{ gridColumn: index + 1, gridRow: 1 }}
                            />
                          ))}
                          {barStyle && (
                            <button
                              type="button"
                              className={`gantt-bar status-${task.status} ${task.startAt ? "range" : "milestone"}`}
                              style={{ ...barStyle, gridRow: 1 }}
                              onClick={() => openEditForm(task)}
                              title={`${task.title}を編集`}
                            >
                              <span>{task.title}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {visibleTasks.some((task) => !task.dueAt) && (
                <div className="undated-tasks">
                  <strong>期限未設定</strong>
                  <div>
                    {visibleTasks.filter((task) => !task.dueAt).map((task) => (
                      <button type="button" key={task.id} onClick={() => openEditForm(task)}>{task.title}</button>
                    ))}
                  </div>
                </div>
              )}
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
          ) : displayMode === "list" ? (
            <div className="task-list">
              {visibleTasks.map((task) => {
                const deadline = dueLabel(task);
                return (
                  <article
                    className={`${isComplete(task) ? "task-card completed" : "task-card"}${pastingTaskId === task.id ? " pasting" : ""}`}
                    key={task.id}
                    tabIndex={0}
                    onPaste={(event) => void handleCardPaste(event, task)}
                  >
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
                      {task.tabId && tabNameById.has(task.tabId) && (
                        <div className="task-tab-row" aria-label="所属タブ">
                          <span className="task-tab-badge">▣ {tabNameById.get(task.tabId)}</span>
                        </div>
                      )}

                      <div className="task-meta">
                        {task.startAt && <span><b>開始</b>{formatDateTime(task.startAt)}</span>}
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
                      <span className="paste-hint">
                        {pastingTaskId === task.id ? "画像を添付中…" : `貼り付け先：${task.title}（Ctrl＋V）`}
                      </span>
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
          ) : null}
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
                    <span>開始日時</span>
                    <input
                      type="datetime-local"
                      value={form.startAt}
                      onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span>期限日時</span>
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
                    <span>タブ</span>
                    <select
                      value={form.tabId}
                      onChange={(event) => setForm((current) => ({ ...current, tabId: event.target.value }))}
                    >
                      <option value="">未分類</option>
                      {tabs.map((tab) => <option value={tab.id} key={tab.id}>{tab.name}</option>)}
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

      {isTabManagerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isSavingTab) setIsTabManagerOpen(false);
        }}>
          <section className="tab-modal" role="dialog" aria-modal="true" aria-labelledby="tab-manager-title">
            <header className="modal-header">
              <div>
                <p>ORGANIZE TASKS</p>
                <h2 id="tab-manager-title">タブを管理</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsTabManagerOpen(false)}
                aria-label="閉じる"
                disabled={isSavingTab}
              >
                ×
              </button>
            </header>

            <div className="tab-manager-content">
              <p className="tab-manager-description">
                ToDoを仕事や案件ごとに分けられます。タグは複数の目印、タブは主な所属先として使えます。
              </p>
              <form className="tab-editor" onSubmit={handleTabSubmit}>
                <label className="form-field">
                  <span>{editingTabId ? "タブ名を変更" : "新しいタブ名"}</span>
                  <input
                    ref={tabInputRef}
                    type="text"
                    value={tabDraft}
                    maxLength={20}
                    onChange={(event) => setTabDraft(event.target.value)}
                    placeholder="例：月次業務、個人、確認待ち"
                  />
                </label>
                <button type="submit" className="primary-button" disabled={isSavingTab || !tabDraft.trim()}>
                  {isSavingTab ? "保存中…" : editingTabId ? "変更する" : "追加する"}
                </button>
                {editingTabId && (
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => {
                      setEditingTabId(null);
                      setTabDraft("");
                    }}
                    disabled={isSavingTab}
                  >
                    変更をやめる
                  </button>
                )}
              </form>

              <div className="tab-manager-list" aria-label="登録済みのタブ">
                {tabs.length === 0 ? (
                  <div className="tab-manager-empty">
                    <strong>タブはまだありません</strong>
                    <span>上の入力欄から最初のタブを追加できます。</span>
                  </div>
                ) : tabs.map((tab) => {
                  const tabCount = tasks.filter((task) => task.tabId === tab.id).length;
                  return (
                    <div className="tab-manager-item" key={tab.id}>
                      <span className="tab-manager-icon" aria-hidden="true">▣</span>
                      <span>
                        <strong>{tab.name}</strong>
                        <small>{tabCount}件のToDo</small>
                      </span>
                      <div>
                        <button type="button" onClick={() => beginEditTab(tab)} disabled={isSavingTab}>改名</button>
                        <button type="button" className="delete-action" onClick={() => void deleteTab(tab)} disabled={isSavingTab}>削除</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
