"use client";

import {
  ClipboardEvent,
  CSSProperties,
  DragEvent,
  FormEvent,
  HTMLAttributes,
  KeyboardEvent,
  TouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "@phosphor-icons/web/regular";
import "@phosphor-icons/web/bold";
import "@phosphor-icons/web/fill";

type WebIconProps = HTMLAttributes<HTMLElement> & {
  size?: number | string;
  weight?: "regular" | "bold" | "fill";
};

function createPhosphorIcon(name: string) {
  return function PhosphorWebIcon({ size = 20, weight = "regular", className = "", style, ...props }: WebIconProps) {
    const weightClass = weight === "regular" ? "ph" : `ph-${weight}`;
    return (
      <i
        {...props}
        aria-hidden={props["aria-hidden"] ?? true}
        className={`${weightClass} ph-${name} ${className}`.trim()}
        style={{ fontSize: size, ...style }}
      />
    );
  };
}

const ArrowCounterClockwise = createPhosphorIcon("arrow-counter-clockwise");
const Bell = createPhosphorIcon("bell");
const CalendarBlank = createPhosphorIcon("calendar-blank");
const CaretLeft = createPhosphorIcon("caret-left");
const CaretRight = createPhosphorIcon("caret-right");
const ChartBarHorizontal = createPhosphorIcon("chart-bar-horizontal");
const CheckCircle = createPhosphorIcon("check-circle");
const Clock = createPhosphorIcon("clock");
const Database = createPhosphorIcon("database");
const DotsSixVertical = createPhosphorIcon("dots-six-vertical");
const DotsThree = createPhosphorIcon("dots-three");
const Funnel = createPhosphorIcon("funnel");
const Kanban = createPhosphorIcon("kanban");
const ListBullets = createPhosphorIcon("list-bullets");
const MagnifyingGlass = createPhosphorIcon("magnifying-glass");
const Paperclip = createPhosphorIcon("paperclip");
const PencilSimple = createPhosphorIcon("pencil-simple");
const Plus = createPhosphorIcon("plus");
const Repeat = createPhosphorIcon("repeat");
const SlidersHorizontal = createPhosphorIcon("sliders-horizontal");
const Tag = createPhosphorIcon("tag");
const Trash = createPhosphorIcon("trash");
const User = createPhosphorIcon("user");
const UsersThree = createPhosphorIcon("users-three");
const X = createPhosphorIcon("x");

type TaskStatus = "open" | "doing" | "waiting" | "done";
type ViewKey = "all" | "today" | "overdue" | "upcoming" | "done" | "trash";
type DisplayMode = "list" | "kanban" | "gantt";
type Recurrence = "none" | "daily" | "weekly" | "monthly";
type ImportMode = "merge" | "replace";

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
  sortOrder: number;
  description: string;
  status: TaskStatus;
  startAt: string;
  dueAt: string;
  tags: string[];
  tabId: string;
  reminderAt: string;
  reminderSentAt: string;
  recurrence: Recurrence;
  recurrenceGeneratedAt: string;
  recurrenceSeriesId: string;
  recurrenceSequence: number;
  deletedAt: string;
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
  startTime: string;
  startHasTime: boolean;
  dueAt: string;
  dueTime: string;
  dueHasTime: boolean;
  tags: string;
  tabId: string;
  reminderAt: string;
  recurrence: Recurrence;
  requester: string;
  assignee: string;
  attachments: Attachment[];
};

type TodoTab = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type TouchDropTarget =
  | { kind: "tab"; targetId: string; placeAfter: boolean }
  | {
      kind: "task";
      targetId: string;
      targetStatus: TaskStatus;
      keepStatus: boolean;
      placeAfter: boolean;
    }
  | { kind: "kanban"; targetStatus: TaskStatus };

type TodoTemplate = {
  id: string;
  name: string;
  title: string;
  description: string;
  tags: string[];
  tabId: string;
  requester: string;
  assignee: string;
  recurrence: Recurrence;
  createdAt: string;
  updatedAt: string;
};

type BackupAttachment = Omit<Attachment, "data"> & { dataUrl: string };
type BackupTask = Omit<Task, "attachments"> & { attachments: BackupAttachment[] };
type BackupPayload = {
  format: "totonou-todo-backup";
  formatVersion: 1;
  dbVersion: 3;
  exportedAt: string;
  tasks: BackupTask[];
  tabs: TodoTab[];
  templates: TodoTemplate[];
};

const DB_NAME = "totonou-todo";
const DB_VERSION = 3;
const TASK_STORE_NAME = "tasks";
const TAB_STORE_NAME = "tabs";
const TEMPLATE_STORE_NAME = "templates";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TASK_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const MAX_BACKUP_FILE_SIZE = 150 * 1024 * 1024;
const GANTT_DAYS = 14;

const initialForm: TaskForm = {
  title: "",
  description: "",
  status: "open",
  startAt: "",
  startTime: "09:00",
  startHasTime: false,
  dueAt: "",
  dueTime: "17:00",
  dueHasTime: false,
  tags: "",
  tabId: "",
  reminderAt: "",
  recurrence: "none",
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
  trash: "ゴミ箱",
};

const recurrenceLabels: Record<Recurrence, string> = {
  none: "繰り返しなし",
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
};

const primaryViews: ViewKey[] = ["today", "upcoming", "overdue", "done"];

function ViewIcon({ view }: { view: ViewKey }) {
  if (view === "today") return <CalendarBlank size={20} weight="regular" />;
  if (view === "upcoming") return <CalendarBlank size={20} weight="regular" />;
  if (view === "overdue") return <Clock size={20} weight="fill" />;
  if (view === "done") return <CheckCircle size={20} weight="regular" />;
  if (view === "trash") return <Trash size={20} weight="regular" />;
  return <ListBullets size={20} weight="regular" />;
}

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
      if (!database.objectStoreNames.contains(TEMPLATE_STORE_NAME)) {
        database.createObjectStore(TEMPLATE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("データ更新がほかの画面で使用中です"));
  });
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    sortOrder: Number.isFinite(task.sortOrder) ? task.sortOrder : 0,
    description: task.description ?? "",
    status: statusLabels[task.status] ? task.status : "open",
    startAt: task.startAt ?? "",
    dueAt: task.dueAt ?? "",
    tags: task.tags ?? [],
    tabId: task.tabId ?? "",
    reminderAt: task.reminderAt ?? "",
    reminderSentAt: task.reminderSentAt ?? "",
    recurrence: recurrenceLabels[task.recurrence] ? task.recurrence : "none",
    recurrenceGeneratedAt: task.recurrenceGeneratedAt ?? "",
    recurrenceSeriesId: task.recurrenceSeriesId ?? task.id,
    recurrenceSequence: task.recurrenceSequence ?? 0,
    deletedAt: task.deletedAt ?? "",
    requester: task.requester ?? "",
    assignee: task.assignee ?? "",
    attachments: task.attachments ?? [],
    completedAt: task.completedAt ?? "",
  };
}

function normalizeTab(tab: TodoTab): TodoTab {
  return {
    ...tab,
    sortOrder: Number.isFinite(tab.sortOrder) ? tab.sortOrder : 0,
  };
}

function buildDesignPreviewData() {
  const now = new Date();
  const tomorrow = toLocalDateKey(addLocalDays(now, 1));
  const yesterday = toLocalDateKey(addLocalDays(now, -1));
  const createdAt = now.toISOString();
  const tabs: TodoTab[] = [
    { id: "preview-shared", name: "共同", sortOrder: 0, createdAt, updatedAt: createdAt },
    { id: "preview-tkc", name: "TKC", sortOrder: 1000, createdAt, updatedAt: createdAt },
  ];
  const baseTask: Omit<Task, "id" | "title" | "sortOrder" | "status" | "dueAt" | "tags" | "tabId"> = {
    description: "",
    startAt: "",
    reminderAt: "",
    reminderSentAt: "",
    recurrence: "none",
    recurrenceGeneratedAt: "",
    recurrenceSeriesId: "preview",
    recurrenceSequence: 0,
    deletedAt: "",
    requester: "",
    assignee: "",
    attachments: [],
    createdAt,
    updatedAt: createdAt,
    completedAt: "",
  };
  const tasks: Task[] = [
    {
      ...baseTask,
      id: "preview-monthly",
      title: "月次資料を確認する",
      sortOrder: 0,
      status: "doing",
      dueAt: `${yesterday}T18:10`,
      tags: ["共同"],
      tabId: "preview-shared",
      assignee: "山田 太郎",
    },
    {
      ...baseTask,
      id: "preview-reply",
      title: "顧問先へ確認事項を返信する",
      sortOrder: 1000,
      status: "open",
      dueAt: `${yesterday}T17:00`,
      tags: ["TKC"],
      tabId: "preview-shared",
      requester: "松本会計",
    },
    {
      ...baseTask,
      id: "preview-meeting",
      title: "来週の打ち合わせ資料を準備する",
      sortOrder: 2000,
      status: "waiting",
      dueAt: tomorrow,
      tags: ["共同", "資料"],
      tabId: "preview-shared",
      description: "議題と前回の宿題を1枚にまとめる。",
    },
    {
      ...baseTask,
      id: "preview-filing",
      title: "電子申告の送信前チェック",
      sortOrder: 3000,
      status: "open",
      dueAt: tomorrow,
      tags: ["TKC"],
      tabId: "preview-tkc",
    },
  ];
  return { tasks, tabs };
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
        (request.result as Task[]).map(normalizeTask),
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

async function writeTasks(tasks: Task[]) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE_NAME, "readwrite");
    const store = transaction.objectStore(TASK_STORE_NAME);
    tasks.forEach((task) => store.put(task));
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
    request.onsuccess = () => resolve(sortTabs((request.result as TodoTab[]).map(normalizeTab)));
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

async function writeTabs(tabs: TodoTab[]) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TAB_STORE_NAME, "readwrite");
    const store = transaction.objectStore(TAB_STORE_NAME);
    tabs.forEach((tab) => store.put(tab));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function readTemplates(): Promise<TodoTemplate[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(TEMPLATE_STORE_NAME, "readonly")
      .objectStore(TEMPLATE_STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve((request.result as TodoTemplate[]).sort((first, second) =>
      first.createdAt.localeCompare(second.createdAt),
    ));
    request.onerror = () => reject(request.error);
    request.transaction.oncomplete = () => database.close();
  });
}

async function writeTemplate(template: TodoTemplate) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TEMPLATE_STORE_NAME, "readwrite");
    transaction.objectStore(TEMPLATE_STORE_NAME).put(template);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function removeTemplateRecord(id: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TEMPLATE_STORE_NAME, "readwrite");
    transaction.objectStore(TEMPLATE_STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function writeWorkspace(
  tasks: Task[],
  tabs: TodoTab[],
  templates: TodoTemplate[],
  mode: ImportMode,
) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [TASK_STORE_NAME, TAB_STORE_NAME, TEMPLATE_STORE_NAME],
      "readwrite",
    );
    const taskStore = transaction.objectStore(TASK_STORE_NAME);
    const tabStore = transaction.objectStore(TAB_STORE_NAME);
    const templateStore = transaction.objectStore(TEMPLATE_STORE_NAME);
    if (mode === "replace") {
      taskStore.clear();
      tabStore.clear();
      templateStore.clear();
    }
    tasks.forEach((task) => taskStore.put(task));
    tabs.forEach((tab) => tabStore.put(tab));
    templates.forEach((template) => templateStore.put(template));
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

function isDeleted(task: Task) {
  return Boolean(task.deletedAt);
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function taskDate(value: string, boundary: "start" | "end" = "start") {
  if (!isDateOnly(value)) return new Date(value);
  const date = fromLocalDateKey(value);
  if (boundary === "end") date.setHours(23, 59, 59, 999);
  return date;
}

function toDateFormValue(value: string, fallbackTime: string) {
  if (!value) return { date: "", time: fallbackTime, hasTime: false };
  if (isDateOnly(value)) return { date: value, time: fallbackTime, hasTime: false };
  const date = new Date(value);
  return {
    date: toLocalDateKey(date),
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    hasTime: true,
  };
}

function composeTaskDateValue(date: string, time: string, hasTime: boolean) {
  if (!date) return "";
  if (!hasTime) return date;
  return new Date(`${date}T${time || "00:00"}`).toISOString();
}

function advanceRecurringValue(value: string, recurrence: Recurrence) {
  if (!value || recurrence === "none") return value;
  const dateOnly = isDateOnly(value);
  const date = taskDate(value);
  if (recurrence === "daily") date.setDate(date.getDate() + 1);
  if (recurrence === "weekly") date.setDate(date.getDate() + 7);
  if (recurrence === "monthly") {
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, lastDay));
  }
  return dateOnly ? toLocalDateKey(date) : date.toISOString();
}

function buildNextRecurringTask(task: Task, now: string): Task {
  const recurrenceSeriesId = task.recurrenceSeriesId || task.id;
  const recurrenceSequence = (task.recurrenceSequence || 0) + 1;
  return {
    ...task,
    id: `${recurrenceSeriesId}-r${recurrenceSequence}`,
    status: "open",
    startAt: advanceRecurringValue(task.startAt, task.recurrence),
    dueAt: advanceRecurringValue(task.dueAt, task.recurrence),
    reminderAt: advanceRecurringValue(task.reminderAt, task.recurrence),
    reminderSentAt: "",
    recurrenceGeneratedAt: "",
    recurrenceSeriesId,
    recurrenceSequence,
    deletedAt: "",
    attachments: [],
    createdAt: now,
    updatedAt: now,
    completedAt: "",
  };
}

function isOverdue(task: Task, now = new Date()) {
  return Boolean(task.dueAt) && !isComplete(task) && taskDate(task.dueAt, "end") < now;
}

function isDueToday(task: Task, now = new Date()) {
  return Boolean(task.dueAt) && isSameLocalDay(taskDate(task.dueAt), now);
}

function isUpcoming(task: Task, now = new Date()) {
  if (!task.dueAt || isComplete(task)) return false;
  const due = taskDate(task.dueAt);
  const start = localDayStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 8);
  return due >= start && due < end;
}

function formatDateTime(value: string) {
  if (!value) return "期限なし";
  if (isDateOnly(value)) {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(taskDate(value));
  }
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("添付ファイルを変換できませんでした"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string, expectedType: string) {
  const separator = dataUrl.indexOf(",");
  if (separator < 0 || !dataUrl.startsWith("data:")) throw new Error("添付データの形式が不正です");
  const header = dataUrl.slice(0, separator);
  const encoded = dataUrl.slice(separator + 1);
  const isBase64 = header.includes(";base64");
  const decoded = isBase64 ? atob(encoded) : decodeURIComponent(encoded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return new Blob([bytes], { type: expectedType || "application/octet-stream" });
}

function backupFileName() {
  const now = new Date();
  return `totonou-todo-backup-${toLocalDateKey(now)}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}.json`;
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
    if (first.sortOrder !== second.sortOrder) return first.sortOrder - second.sortOrder;
    if (isComplete(first) !== isComplete(second)) return isComplete(first) ? 1 : -1;
    if (!first.dueAt && !second.dueAt) return second.createdAt.localeCompare(first.createdAt);
    if (!first.dueAt) return 1;
    if (!second.dueAt) return -1;
    return first.dueAt.localeCompare(second.dueAt);
  });
}

function sortTabs(tabs: TodoTab[]) {
  return [...tabs].sort((first, second) =>
    first.sortOrder - second.sortOrder || first.createdAt.localeCompare(second.createdAt),
  );
}

function sortTemplates(templates: TodoTemplate[]) {
  return [...templates].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

function nextTaskSortOrder(tasks: Task[]) {
  const activeTasks = tasks.filter((task) => !isDeleted(task));
  return activeTasks.length > 0
    ? Math.min(...activeTasks.map((task) => task.sortOrder)) - 1000
    : 0;
}

function nextTabSortOrder(tabs: TodoTab[]) {
  return tabs.length > 0
    ? Math.max(...tabs.map((tab) => tab.sortOrder)) + 1000
    : 0;
}

export function TodoApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tabs, setTabs] = useState<TodoTab[]>([]);
  const [templates, setTemplates] = useState<TodoTemplate[]>([]);
  const [activeView, setActiveView] = useState<ViewKey>("all");
  const [activeTabId, setActiveTabId] = useState("all");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("list");
  const [timelineStart, setTimelineStart] = useState("");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [touchDropTargetKey, setTouchDropTargetKey] = useState("");
  const [pastingTaskId, setPastingTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTabManagerOpen, setIsTabManagerOpen] = useState(false);
  const [isDataManagerOpen, setIsDataManagerOpen] = useState(false);
  const [isProcessingData, setIsProcessingData] = useState(false);
  const [isSavingTab, setIsSavingTab] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabDraft, setTabDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(true);
  const [form, setForm] = useState<TaskForm>(initialForm);
  const [todayText, setTodayText] = useState("予定をひと目で整理");
  const [notice, setNotice] = useState("");
  const [undoDelete, setUndoDelete] = useState<{ task: Task; message: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ attachment: Attachment; taskTitle: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoadError, setPreviewLoadError] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [storageError, setStorageError] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tabInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const previewReturnFocusRef = useRef<HTMLElement | null>(null);
  const reminderCheckRef = useRef(false);
  const canceledTitleEditRef = useRef<string | null>(null);
  const savingTitleIdRef = useRef<string | null>(null);
  const lastTitleClickRef = useRef<{ taskId: string; at: number } | null>(null);
  const touchDropTargetRef = useRef<TouchDropTarget | null>(null);

  useEffect(() => {
    const isDesignPreview = new URLSearchParams(window.location.search).get("design-preview") === "1";
    const previewData = isDesignPreview ? buildDesignPreviewData() : null;
    const savedDisplayMode = window.localStorage.getItem("totonou-display-mode");
    if (previewData) {
      setActiveTabId("preview-shared");
      setActiveView("overdue");
      setDisplayMode("list");
    } else if (savedDisplayMode === "list" || savedDisplayMode === "kanban" || savedDisplayMode === "gantt") {
      setDisplayMode(savedDisplayMode);
    }
    setTimelineStart(toLocalDateKey(localDayStart()));
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
    setTodayText(
      new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(new Date()),
    );
    Promise.all([readTasks(), readTabs(), readTemplates()])
      .then(([savedTasks, savedTabs, savedTemplates]) => {
        setTasks(sortTasks(previewData && savedTasks.length === 0 ? previewData.tasks : savedTasks));
        setTabs(previewData && savedTabs.length === 0 ? previewData.tabs : savedTabs);
        setTemplates(savedTemplates);
      })
      .catch(() => {
        if (previewData) {
          setTasks(sortTasks(previewData.tasks));
          setTabs(previewData.tabs);
        } else {
          setStorageError(true);
        }
      })
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
    if (!isDataManagerOpen) return;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !isProcessingData) setIsDataManagerOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isDataManagerOpen, isProcessingData]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice("");
      setUndoDelete(null);
    }, undoDelete?.message === notice ? 6500 : 2800);
    return () => window.clearTimeout(timer);
  }, [notice, undoDelete]);

  useEffect(() => {
    if (!previewTarget) {
      setPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(previewTarget.attachment.data);
    setPreviewLoadError(false);
    setPreviewUrl(objectUrl);
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setPreviewTarget(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      URL.revokeObjectURL(objectUrl);
      window.removeEventListener("keydown", handleEscape);
      window.setTimeout(() => previewReturnFocusRef.current?.focus(), 0);
    };
  }, [previewTarget]);

  useEffect(() => {
    if (isLoading) return;
    const checkReminders = async () => {
      if (reminderCheckRef.current) return;
      const now = new Date();
      const dueReminders = tasks.filter((task) =>
        !isDeleted(task) &&
        !isComplete(task) &&
        Boolean(task.reminderAt) &&
        !task.reminderSentAt &&
        new Date(task.reminderAt) <= now,
      );
      if (dueReminders.length === 0) return;
      reminderCheckRef.current = true;
      const sentAt = now.toISOString();
      const updated = dueReminders.map((task) => ({ ...task, reminderSentAt: sentAt, updatedAt: sentAt }));
      try {
        await writeTasks(updated);
        const updatedById = new Map(updated.map((task) => [task.id, task]));
        setTasks((current) => sortTasks(current.map((task) => updatedById.get(task.id) ?? task)));
        dueReminders.forEach((task) => {
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("ToDoリマインダー", {
                body: `「${task.title}」の確認時間です。`,
                tag: `totonou-${task.id}-${task.reminderAt}`,
              });
            } catch {
              // 画面内通知は下で必ず表示します。
            }
          }
        });
        const first = dueReminders[0];
        setNotice(dueReminders.length === 1
          ? `リマインダー：「${first.title}」の確認時間です`
          : `${dueReminders.length}件のリマインダーがあります`);
      } catch {
        setStorageError(true);
      } finally {
        reminderCheckRef.current = false;
      }
    };
    void checkReminders();
    const timer = window.setInterval(() => void checkReminders(), 30_000);
    return () => window.clearInterval(timer);
  }, [isLoading, tasks]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [activeTabId, tabs],
  );

  const tabNameById = useMemo(
    () => new Map(tabs.map((tab) => [tab.id, tab.name])),
    [tabs],
  );

  const allTabScopedTasks = useMemo(
    () => activeTabId === "all" ? tasks : tasks.filter((task) => task.tabId === activeTabId),
    [activeTabId, tasks],
  );

  const tabScopedTasks = useMemo(
    () => allTabScopedTasks.filter((task) => !isDeleted(task)),
    [allTabScopedTasks],
  );

  const counts = useMemo(() => {
    const now = new Date();
    return {
      all: tabScopedTasks.length,
      today: tabScopedTasks.filter((task) => isDueToday(task, now) && !isComplete(task)).length,
      overdue: tabScopedTasks.filter((task) => isOverdue(task, now)).length,
      upcoming: tabScopedTasks.filter((task) => isUpcoming(task, now)).length,
      done: tabScopedTasks.filter(isComplete).length,
      trash: allTabScopedTasks.filter(isDeleted).length,
    };
  }, [allTabScopedTasks, tabScopedTasks]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ja-JP");
    const now = new Date();
    const sourceTasks = activeView === "trash" ? allTabScopedTasks : tabScopedTasks;
    return sortTasks(sourceTasks).filter((task) => {
      const matchesView =
        (activeView === "all" && !isDeleted(task)) ||
        (activeView === "today" && isDueToday(task, now) && !isComplete(task)) ||
        (activeView === "overdue" && isOverdue(task, now)) ||
        (activeView === "upcoming" && isUpcoming(task, now)) ||
        (activeView === "done" && isComplete(task)) ||
        (activeView === "trash" && isDeleted(task));
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
  }, [activeView, allTabScopedTasks, search, tabNameById, tabScopedTasks]);

  const timelineDays = useMemo(() => {
    if (!timelineStart) return [];
    const start = fromLocalDateKey(timelineStart);
    return Array.from({ length: GANTT_DAYS }, (_, index) => addLocalDays(start, index));
  }, [timelineStart]);

  const effectiveDisplayMode: DisplayMode = activeView === "trash" ? "list" : displayMode;
  const selectedTask = effectiveDisplayMode === "list" && activeView !== "trash"
    ? visibleTasks.find((task) => task.id === selectedTaskId) ?? visibleTasks[0] ?? null
    : null;
  const selectedTaskDeadline = selectedTask ? dueLabel(selectedTask) : null;
  const activeTaskCount = useMemo(() => tasks.filter((task) => !isDeleted(task)).length, [tasks]);
  const trashTaskCount = useMemo(() => tasks.filter(isDeleted).length, [tasks]);
  const totalAttachmentSize = useMemo(() => tasks.reduce(
    (total, task) => total + task.attachments.reduce((sum, attachment) => sum + attachment.size, 0),
    0,
  ), [tasks]);
  const totalAttachmentCount = useMemo(() => tasks.reduce(
    (total, task) => total + task.attachments.length,
    0,
  ), [tasks]);

  function switchDisplayMode(mode: DisplayMode) {
    setDisplayMode(mode);
    window.localStorage.setItem("totonou-display-mode", mode);
  }

  function showAllTasks() {
    setActiveTabId("all");
    setActiveView("all");
    setSearch("");
  }

  function clearFilterConditions() {
    setActiveView("all");
    setSearch("");
  }

  function beginInlineTitleEdit(task: Task) {
    if (isDeleted(task)) return;
    canceledTitleEditRef.current = null;
    setEditingTitleId(task.id);
    setTitleDraft(task.title);
  }

  async function saveInlineTitle(task: Task) {
    if (canceledTitleEditRef.current === task.id) {
      canceledTitleEditRef.current = null;
      return;
    }
    if (savingTitleIdRef.current === task.id) return;
    const title = titleDraft.trim();
    if (!title) {
      setEditingTitleId(null);
      setTitleDraft(task.title);
      setNotice("タイトルは空欄にできません");
      return;
    }
    if (title === task.title) {
      setEditingTitleId(null);
      return;
    }

    const currentTask = tasks.find((item) => item.id === task.id) ?? task;
    const updatedTask = { ...currentTask, title, updatedAt: new Date().toISOString() };
    savingTitleIdRef.current = task.id;
    setEditingTitleId(null);
    setTasks((current) => sortTasks(current.map((item) => item.id === task.id ? updatedTask : item)));
    try {
      await writeTask(updatedTask);
      setNotice("タイトルを更新しました");
    } catch {
      setTasks((current) => sortTasks(current.map((item) =>
        item.id === task.id ? { ...item, title: currentTask.title } : item,
      )));
      setStorageError(true);
      setNotice("タイトルを保存できませんでした");
    } finally {
      savingTitleIdRef.current = null;
    }
  }

  function handleInlineTitleKeyDown(event: KeyboardEvent<HTMLInputElement>, task: Task) {
    if (event.key === "Enter") {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      canceledTitleEditRef.current = task.id;
      setTitleDraft(task.title);
      setEditingTitleId(null);
    }
  }

  function renderInlineTitle(task: Task, className: string, showInput = true) {
    if (editingTitleId === task.id && showInput) {
      return (
        <input
          className="inline-title-input"
          type="text"
          value={titleDraft}
          maxLength={120}
          autoFocus
          aria-label={`${task.title}のタイトルを編集`}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setTitleDraft(event.target.value)}
          onKeyDown={(event) => handleInlineTitleKeyDown(event, task)}
          onBlur={() => void saveInlineTitle(task)}
          onDoubleClick={(event) => event.stopPropagation()}
        />
      );
    }
    return (
      <button
        type="button"
        className={className}
        draggable={false}
        title="ダブルクリックでタイトルを編集"
        onClick={(event) => {
          event.stopPropagation();
          const now = Date.now();
          const lastClick = lastTitleClickRef.current;
          if (event.detail >= 2 || (lastClick?.taskId === task.id && now - lastClick.at < 500)) {
            lastTitleClickRef.current = null;
            window.setTimeout(() => beginInlineTitleEdit(task), 0);
          } else {
            lastTitleClickRef.current = { taskId: task.id, at: now };
          }
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          window.setTimeout(() => beginInlineTitleEdit(task), 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "F2") {
            event.preventDefault();
            beginInlineTitleEdit(task);
          }
        }}
      >
        {task.title}
      </button>
    );
  }

  async function reorderTabs(sourceId: string, targetId: string, placeAfter: boolean) {
    if (sourceId === targetId) return;
    const previousTabs = tabs;
    const ordered = sortTabs(tabs);
    const source = ordered.find((tab) => tab.id === sourceId);
    if (!source) return;
    const withoutSource = ordered.filter((tab) => tab.id !== sourceId);
    const targetIndex = withoutSource.findIndex((tab) => tab.id === targetId);
    if (targetIndex < 0) return;
    withoutSource.splice(targetIndex + (placeAfter ? 1 : 0), 0, source);
    const reordered = withoutSource.map((tab, index) => ({ ...tab, sortOrder: index * 1000 }));
    const previousById = new Map(previousTabs.map((tab) => [tab.id, tab]));
    const changedTabs = reordered.filter((tab) => previousById.get(tab.id)?.sortOrder !== tab.sortOrder);
    setTabs(reordered);
    try {
      await writeTabs(changedTabs);
      setNotice("タブの並び順を保存しました");
    } catch {
      setTabs(previousTabs);
      setStorageError(true);
      setNotice("タブの並び順を保存できませんでした");
    }
  }

  function handleTabDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const sourceId = draggingTabId || event.dataTransfer.getData("application/x-todo-tab");
    const bounds = event.currentTarget.getBoundingClientRect();
    const placeAfter = event.clientX > bounds.left + bounds.width / 2;
    setDraggingTabId(null);
    if (sourceId) void reorderTabs(sourceId, targetId, placeAfter);
  }

  function updateTouchDropTarget(target: TouchDropTarget | null, key = "") {
    touchDropTargetRef.current = target;
    setTouchDropTargetKey((current) => current === key ? current : key);
  }

  function clearTouchDragState() {
    touchDropTargetRef.current = null;
    setTouchDropTargetKey("");
    setDraggingTabId(null);
    setDraggingTaskId(null);
  }

  function handleTabTouchStart(event: TouchEvent<HTMLButtonElement>, sourceId: string) {
    event.stopPropagation();
    updateTouchDropTarget(null);
    setDraggingTabId(sourceId);
  }

  function handleTabTouchMove(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    event.preventDefault();
    const target = document
      .elementFromPoint(touch.clientX, touch.clientY)
      ?.closest<HTMLElement>("[data-todo-tab-id]");
    const targetId = target?.dataset.todoTabId;
    if (!target || !targetId) {
      updateTouchDropTarget(null);
      return;
    }
    const bounds = target.getBoundingClientRect();
    const placeAfter = touch.clientX > bounds.left + bounds.width / 2;
    updateTouchDropTarget({ kind: "tab", targetId, placeAfter }, `tab:${targetId}`);
  }

  function handleTabTouchEnd(sourceId: string) {
    const target = touchDropTargetRef.current;
    clearTouchDragState();
    if (target?.kind === "tab" && target.targetId !== sourceId) {
      void reorderTabs(sourceId, target.targetId, target.placeAfter);
    }
  }

  function handleTabHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: TodoTab) {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const ordered = sortTabs(tabs);
    const index = ordered.findIndex((item) => item.id === tab.id);
    const targetIndex = event.key === "ArrowLeft" ? index - 1 : index + 1;
    const target = ordered[targetIndex];
    if (target) void reorderTabs(tab.id, target.id, event.key === "ArrowRight");
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
      sortOrder: previousTab?.sortOrder ?? nextTabSortOrder(tabs),
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
    const start = toDateFormValue(task.startAt, "09:00");
    const due = toDateFormValue(task.dueAt, "17:00");
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description,
      status: task.status,
      startAt: start.date,
      startTime: start.time,
      startHasTime: start.hasTime,
      dueAt: due.date,
      dueTime: due.time,
      dueHasTime: due.hasTime,
      tags: task.tags.join("、"),
      tabId: tabs.some((tab) => tab.id === task.tabId) ? task.tabId : "",
      reminderAt: toLocalInput(task.reminderAt),
      recurrence: task.recurrence,
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
    const startAt = composeTaskDateValue(form.startAt, form.startTime, form.startHasTime);
    const dueAt = composeTaskDateValue(form.dueAt, form.dueTime, form.dueHasTime);
    if (startAt && dueAt && taskDate(startAt) > taskDate(dueAt, "end")) {
      setNotice("期限は開始日以降に設定してください");
      return;
    }
    setIsSaving(true);
    const now = new Date().toISOString();
    const nextStatus = form.status;
    const taskId = previousTask?.id ?? createId();
    const reminderAt = form.reminderAt ? new Date(form.reminderAt).toISOString() : "";
    let task: Task = {
      id: taskId,
      title,
      sortOrder: previousTask?.sortOrder ?? nextTaskSortOrder(tasks),
      description: form.description.trim(),
      status: nextStatus,
      startAt,
      dueAt,
      tags: parseTags(form.tags),
      tabId: tabs.some((tab) => tab.id === form.tabId) ? form.tabId : "",
      reminderAt,
      reminderSentAt: previousTask?.reminderAt === reminderAt ? previousTask.reminderSentAt : "",
      recurrence: form.recurrence,
      recurrenceGeneratedAt: previousTask?.recurrenceGeneratedAt ?? "",
      recurrenceSeriesId: previousTask?.recurrenceSeriesId || taskId,
      recurrenceSequence: previousTask?.recurrenceSequence ?? 0,
      deletedAt: previousTask?.deletedAt ?? "",
      requester: form.requester.trim(),
      assignee: form.assignee.trim(),
      attachments: form.attachments,
      createdAt: previousTask?.createdAt ?? now,
      updatedAt: now,
      completedAt:
        nextStatus === "done" ? previousTask?.completedAt || now : "",
    };

    const shouldGenerateNext =
      nextStatus === "done" &&
      previousTask?.status !== "done" &&
      task.recurrence !== "none" &&
      !task.recurrenceGeneratedAt;
    const nextRecurringTask = shouldGenerateNext
      ? { ...buildNextRecurringTask(task, now), sortOrder: nextTaskSortOrder(tasks) }
      : null;
    if (nextRecurringTask) task = { ...task, recurrenceGeneratedAt: now };

    try {
      if (nextRecurringTask) await writeTasks([task, nextRecurringTask]);
      else await writeTask(task);
      setTasks((current) =>
        sortTasks([
          ...current.filter((item) => item.id !== task.id && item.id !== nextRecurringTask?.id),
          task,
          ...(nextRecurringTask ? [nextRecurringTask] : []),
        ]),
      );
      setIsFormOpen(false);
      setNotice(nextRecurringTask
        ? "ToDoを保存し、次回分を作成しました"
        : previousTask ? "ToDoを更新しました" : "ToDoを登録しました");
    } catch {
      setStorageError(true);
      setNotice("保存できませんでした。もう一度お試しください");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveTaskStatus(
    task: Task,
    nextStatus: TaskStatus,
    targetTaskId?: string,
    placeAfter = false,
    placeAtEnd = false,
  ) {
    if (task.status === nextStatus && (!targetTaskId || targetTaskId === task.id) && !placeAtEnd) return;
    const previousTasks = tasks;
    const now = new Date().toISOString();
    let nextTask: Task = {
      ...task,
      status: nextStatus,
      completedAt: nextStatus === "done" ? task.completedAt || now : "",
      updatedAt: now,
    };
    const nextRecurringTask =
      nextStatus === "done" &&
      task.recurrence !== "none" &&
      !task.recurrenceGeneratedAt
        ? buildNextRecurringTask(nextTask, now)
        : null;
    if (nextRecurringTask) nextTask = { ...nextTask, recurrenceGeneratedAt: now };

    const orderedActiveTasks = sortTasks(previousTasks.filter((item) =>
      !isDeleted(item) && item.id !== task.id && item.id !== nextRecurringTask?.id,
    ));
    let insertIndex = orderedActiveTasks.length;
    if (targetTaskId) {
      const targetIndex = orderedActiveTasks.findIndex((item) => item.id === targetTaskId);
      if (targetIndex >= 0) insertIndex = targetIndex + (placeAfter ? 1 : 0);
    } else {
      const lastStatusIndex = orderedActiveTasks.reduce(
        (lastIndex, item, index) => item.status === nextStatus ? index : lastIndex,
        -1,
      );
      if (lastStatusIndex >= 0) insertIndex = lastStatusIndex + 1;
    }
    orderedActiveTasks.splice(insertIndex, 0, nextTask);
    if (nextRecurringTask) {
      orderedActiveTasks.unshift({
        ...nextRecurringTask,
        sortOrder: nextTaskSortOrder(previousTasks),
      });
    }

    const movedIndex = orderedActiveTasks.findIndex((item) => item.id === task.id);
    const previousNeighbor = movedIndex > 0 ? orderedActiveTasks[movedIndex - 1] : undefined;
    const nextNeighbor = movedIndex < orderedActiveTasks.length - 1
      ? orderedActiveTasks[movedIndex + 1]
      : undefined;
    const needsReindex = Boolean(
      previousNeighbor && nextNeighbor && nextNeighbor.sortOrder - previousNeighbor.sortOrder <= 1,
    );
    const movedSortOrder = previousNeighbor && nextNeighbor
      ? Math.trunc((previousNeighbor.sortOrder + nextNeighbor.sortOrder) / 2)
      : previousNeighbor
        ? previousNeighbor.sortOrder + 1000
        : nextNeighbor
          ? nextNeighbor.sortOrder - 1000
          : 0;
    const reorderedActiveTasks = needsReindex
      ? orderedActiveTasks.map((item, index) => ({ ...item, sortOrder: index * 1000 }))
      : orderedActiveTasks.map((item) => item.id === task.id
        ? { ...item, sortOrder: movedSortOrder }
        : item);
    const previousById = new Map(previousTasks.map((item) => [item.id, item]));
    const changedTasks = reorderedActiveTasks.filter((item) => {
      const previous = previousById.get(item.id);
      return !previous ||
        previous.sortOrder !== item.sortOrder ||
        previous.status !== item.status ||
        previous.completedAt !== item.completedAt ||
        previous.updatedAt !== item.updatedAt ||
        previous.recurrenceGeneratedAt !== item.recurrenceGeneratedAt;
    });
    const nextTasks = sortTasks([
      ...reorderedActiveTasks,
      ...previousTasks.filter(isDeleted),
    ]);
    setTasks(nextTasks);
    try {
      await writeTasks(changedTasks);
      setNotice(task.status === nextStatus
        ? "ToDoの並び順を保存しました"
        : nextRecurringTask
          ? `「${statusLabels[nextStatus]}」へ移動し、次回分を作成しました`
          : `「${statusLabels[nextStatus]}」へ移動しました`);
    } catch {
      setTasks(previousTasks);
      setStorageError(true);
      setNotice("変更を保存できませんでした");
    }
  }

  async function toggleComplete(task: Task) {
    await moveTaskStatus(task, task.status === "done" ? "open" : "done");
  }

  function handleTaskDragStart(event: DragEvent<HTMLElement>, task: Task) {
    if (editingTitleId === task.id) {
      event.preventDefault();
      return;
    }
    setDraggingTaskId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-todo-task", task.id);
    event.dataTransfer.setData("text/plain", task.id);
  }

  function handleTaskHandleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    task: Task,
    orderedTasks: Task[],
  ) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const index = orderedTasks.findIndex((item) => item.id === task.id);
    const targetIndex = event.key === "ArrowUp" ? index - 1 : index + 1;
    const target = orderedTasks[targetIndex];
    if (target) {
      void moveTaskStatus(task, task.status, target.id, event.key === "ArrowDown");
    }
  }

  function draggedTaskFromEvent(event: DragEvent<HTMLElement>) {
    const sourceId = draggingTaskId ||
      event.dataTransfer.getData("application/x-todo-task") ||
      event.dataTransfer.getData("text/plain");
    return tasks.find((item) => item.id === sourceId);
  }

  function handleTaskTouchStart(event: TouchEvent<HTMLButtonElement>, task: Task) {
    if (editingTitleId === task.id) return;
    event.stopPropagation();
    updateTouchDropTarget(null);
    setDraggingTaskId(task.id);
  }

  function handleTaskTouchMove(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    event.preventDefault();
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const card = element?.closest<HTMLElement>("[data-todo-task-id]");
    const targetId = card?.dataset.todoTaskId;
    const cardStatus = card?.dataset.todoTaskStatus;
    if (card && targetId && cardStatus && cardStatus in statusLabels) {
      const bounds = card.getBoundingClientRect();
      const placeAfter = touch.clientY > bounds.top + bounds.height / 2;
      updateTouchDropTarget({
        kind: "task",
        targetId,
        targetStatus: cardStatus as TaskStatus,
        keepStatus: card.dataset.taskKeepStatus === "true",
        placeAfter,
      }, `task:${targetId}`);
      return;
    }
    const column = element?.closest<HTMLElement>("[data-kanban-status]");
    const columnStatus = column?.dataset.kanbanStatus;
    if (columnStatus && columnStatus in statusLabels) {
      updateTouchDropTarget(
        { kind: "kanban", targetStatus: columnStatus as TaskStatus },
        `kanban:${columnStatus}`,
      );
      return;
    }
    updateTouchDropTarget(null);
  }

  function handleTaskTouchEnd(task: Task) {
    const target = touchDropTargetRef.current;
    clearTouchDragState();
    if (target?.kind === "task" && target.targetId !== task.id) {
      void moveTaskStatus(
        task,
        target.keepStatus ? task.status : target.targetStatus,
        target.targetId,
        target.placeAfter,
      );
    } else if (target?.kind === "kanban") {
      void moveTaskStatus(task, target.targetStatus, undefined, false, true);
    }
  }

  function handleTaskCardDrop(event: DragEvent<HTMLElement>, targetTask: Task, keepStatus: boolean) {
    event.preventDefault();
    event.stopPropagation();
    const task = draggedTaskFromEvent(event);
    const bounds = event.currentTarget.getBoundingClientRect();
    const placeAfter = event.clientY > bounds.top + bounds.height / 2;
    setDraggingTaskId(null);
    if (task && task.id !== targetTask.id) {
      void moveTaskStatus(
        task,
        keepStatus ? task.status : targetTask.status,
        targetTask.id,
        placeAfter,
      );
    }
  }

  function handleKanbanDrop(event: DragEvent<HTMLDivElement>, status: TaskStatus) {
    event.preventDefault();
    const task = draggedTaskFromEvent(event);
    setDraggingTaskId(null);
    if (task) void moveTaskStatus(task, status, undefined, false, true);
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
    const taskStart = localDayStart(taskDate(task.startAt || task.dueAt));
    const taskEnd = localDayStart(taskDate(task.dueAt));
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
    const now = new Date().toISOString();
    const deletedTask = { ...task, deletedAt: now, updatedAt: now };
    try {
      await writeTask(deletedTask);
      setTasks((current) => sortTasks(current.map((item) => item.id === task.id ? deletedTask : item)));
      const message = `「${task.title}」をゴミ箱へ移動しました`;
      setUndoDelete({ task, message });
      setNotice(message);
    } catch {
      setNotice("削除できませんでした");
    }
  }

  async function restoreTask(task: Task) {
    const restoredTask = { ...task, deletedAt: "", updatedAt: new Date().toISOString() };
    try {
      await writeTask(restoredTask);
      setTasks((current) => sortTasks(current.map((item) => item.id === task.id ? restoredTask : item)));
      setUndoDelete(null);
      setNotice(`「${task.title}」を元に戻しました`);
    } catch {
      setNotice("ToDoを元に戻せませんでした");
    }
  }

  async function undoLastDelete() {
    if (!undoDelete) return;
    await restoreTask(undoDelete.task);
  }

  async function permanentlyDeleteTask(task: Task) {
    if (!window.confirm(`「${task.title}」を完全に削除しますか？\n添付ファイルも削除され、元に戻せません。`)) return;
    try {
      await removeTaskRecord(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setNotice("ToDoを完全に削除しました");
    } catch {
      setNotice("完全に削除できませんでした");
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

  function openImagePreview(attachment: Attachment, taskTitle: string, trigger?: HTMLElement) {
    if (!attachment.type.startsWith("image/")) {
      downloadAttachment(attachment);
      return;
    }
    previewReturnFocusRef.current = trigger ?? null;
    setPreviewTarget({ attachment, taskTitle });
  }

  function closeImagePreview() {
    setPreviewTarget(null);
  }

  function applyTemplate(template: TodoTemplate) {
    const hasDraft = Boolean(
      form.title.trim() ||
      form.description.trim() ||
      form.tags.trim() ||
      form.requester.trim() ||
      form.assignee.trim(),
    );
    if (hasDraft && !window.confirm("現在入力している内容をテンプレートで置き換えますか？")) return;
    setForm({
      ...initialForm,
      title: template.title,
      description: template.description,
      tags: template.tags.join("、"),
      tabId: tabs.some((tab) => tab.id === template.tabId) ? template.tabId : "",
      requester: template.requester,
      assignee: template.assignee,
      recurrence: template.recurrence,
    });
  }

  function createFromTemplate(template: TodoTemplate) {
    setEditingId(null);
    setForm({
      ...initialForm,
      title: template.title,
      description: template.description,
      tags: template.tags.join("、"),
      tabId: tabs.some((tab) => tab.id === template.tabId) ? template.tabId : "",
      requester: template.requester,
      assignee: template.assignee,
      recurrence: template.recurrence,
    });
    setIsDataManagerOpen(false);
    setIsFormOpen(true);
  }

  async function saveCurrentAsTemplate() {
    if (!form.title.trim()) {
      setNotice("テンプレートにするタイトルを入力してください");
      titleInputRef.current?.focus();
      return;
    }
    const requestedName = window.prompt("テンプレート名を入力してください", form.title.trim());
    const name = requestedName?.trim();
    if (!name) return;
    const previous = templates.find((template) =>
      template.name.toLocaleLowerCase("ja-JP") === name.toLocaleLowerCase("ja-JP"),
    );
    if (previous && !window.confirm(`テンプレート「${previous.name}」を上書きしますか？`)) return;
    const now = new Date().toISOString();
    const template: TodoTemplate = {
      id: previous?.id ?? createId(),
      name,
      title: form.title.trim(),
      description: form.description.trim(),
      tags: parseTags(form.tags),
      tabId: tabs.some((tab) => tab.id === form.tabId) ? form.tabId : "",
      requester: form.requester.trim(),
      assignee: form.assignee.trim(),
      recurrence: form.recurrence,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await writeTemplate(template);
      setTemplates((current) => sortTemplates([
        ...current.filter((item) => item.id !== template.id),
        template,
      ]));
      setNotice(previous ? "テンプレートを更新しました" : "テンプレートを保存しました");
    } catch {
      setStorageError(true);
      setNotice("テンプレートを保存できませんでした");
    }
  }

  async function deleteTemplate(template: TodoTemplate) {
    if (!window.confirm(`テンプレート「${template.name}」を削除しますか？`)) return;
    try {
      await removeTemplateRecord(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setNotice("テンプレートを削除しました");
    } catch {
      setNotice("テンプレートを削除できませんでした");
    }
  }

  async function exportBackup() {
    setIsProcessingData(true);
    try {
      const backupTasks = await Promise.all(tasks.map(async (task): Promise<BackupTask> => {
        const { attachments, ...taskData } = task;
        return {
          ...taskData,
          attachments: await Promise.all(attachments.map(async (attachment) => {
            const { data, ...attachmentData } = attachment;
            return { ...attachmentData, dataUrl: await blobToDataUrl(data) };
          })),
        };
      }));
      const payload: BackupPayload = {
        format: "totonou-todo-backup",
        formatVersion: 1,
        dbVersion: DB_VERSION,
        exportedAt: new Date().toISOString(),
        tasks: backupTasks,
        tabs,
        templates,
      };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      if (blob.size > MAX_BACKUP_FILE_SIZE) throw new Error("バックアップが150MBを超えています");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backupFileName();
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("添付を含むバックアップを保存しました");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "バックアップを作成できませんでした");
    } finally {
      setIsProcessingData(false);
    }
  }

  async function restoreBackup(file: File) {
    if (file.size > MAX_BACKUP_FILE_SIZE) {
      setNotice("バックアップファイルは150MBまでです");
      return;
    }
    setIsProcessingData(true);
    try {
      const parsed = JSON.parse(await file.text()) as Partial<BackupPayload>;
      if (
        parsed.format !== "totonou-todo-backup" ||
        parsed.formatVersion !== 1 ||
        !Array.isArray(parsed.tasks) ||
        !Array.isArray(parsed.tabs) ||
        !Array.isArray(parsed.templates)
      ) {
        throw new Error("ととのうToDoのバックアップファイルではありません");
      }

      const restoredTabs = (parsed.tabs as TodoTab[]).map(normalizeTab);
      const restoredTemplates = parsed.templates as TodoTemplate[];
      const tabIds = new Set(restoredTabs.map((tab) => tab.id));
      if (tabIds.size !== restoredTabs.length || restoredTabs.some((tab) => !tab.id || !tab.name)) {
        throw new Error("バックアップ内のタブ情報が不正です");
      }
      if (new Set(restoredTemplates.map((template) => template.id)).size !== restoredTemplates.length) {
        throw new Error("バックアップ内のテンプレート情報が不正です");
      }
      if (restoredTemplates.some((template) => !template.id || !template.name || !template.title)) {
        throw new Error("バックアップ内のテンプレート情報が不正です");
      }

      const restoredTasks = await Promise.all((parsed.tasks as BackupTask[]).map(async (rawTask) => {
        if (!rawTask.id || !rawTask.title || !Array.isArray(rawTask.attachments)) {
          throw new Error("バックアップ内のToDo情報が不正です");
        }
        if (rawTask.attachments.length > 10) throw new Error("添付ファイル数が上限を超えています");
        const attachments = await Promise.all(rawTask.attachments.map(async (rawAttachment) => {
          if (!rawAttachment.id || !rawAttachment.name || typeof rawAttachment.dataUrl !== "string") {
            throw new Error("バックアップ内の添付情報が不正です");
          }
          const data = dataUrlToBlob(rawAttachment.dataUrl, rawAttachment.type);
          if (data.size !== rawAttachment.size || data.size > MAX_FILE_SIZE) {
            throw new Error("添付ファイルの容量が不正です");
          }
          return { ...rawAttachment, data } as Attachment;
        }));
        if (attachments.reduce((sum, attachment) => sum + attachment.size, 0) > MAX_TASK_ATTACHMENT_SIZE) {
          throw new Error("ToDoの添付容量が上限を超えています");
        }
        const normalized = normalizeTask({ ...rawTask, attachments } as Task);
        return {
          ...normalized,
          tabId: tabIds.has(normalized.tabId) ? normalized.tabId : "",
        };
      }));
      if (new Set(restoredTasks.map((task) => task.id)).size !== restoredTasks.length) {
        throw new Error("バックアップ内のToDo IDが重複しています");
      }
      const safeTemplates = restoredTemplates.map((template) => ({
        ...template,
        tabId: tabIds.has(template.tabId) ? template.tabId : "",
        recurrence: recurrenceLabels[template.recurrence] ? template.recurrence : "none" as Recurrence,
      }));

      const confirmed = window.confirm(
        `バックアップを復元しますか？\n現在のデータは置き換えられます。\n\nToDo ${restoredTasks.length}件・タブ ${restoredTabs.length}件・テンプレート ${safeTemplates.length}件`,
      );
      if (!confirmed) return;
      await writeWorkspace(restoredTasks, restoredTabs, safeTemplates, "replace");
      setTasks(sortTasks(restoredTasks));
      setTabs(sortTabs(restoredTabs));
      setTemplates(sortTemplates(safeTemplates));
      setActiveTabId("all");
      setActiveView("all");
      setSearch("");
      setIsDataManagerOpen(false);
      setNotice("バックアップを復元しました");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "バックアップを復元できませんでした");
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = "";
      setIsProcessingData(false);
    }
  }

  async function requestReminderPermission() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setNotice("このブラウザは通知に対応していません。画面内でお知らせします");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      setNotice(permission === "granted"
        ? "リマインダー通知を有効にしました"
        : "通知は許可されていません。画面内でお知らせします");
    } catch {
      setNotice("通知設定を変更できませんでした");
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

  const workspaceTitle = activeTab?.name ?? (activeView === "all" ? "すべてのToDo" : viewLabels[activeView]);
  const workspaceDescription = activeTab
    ? `「${activeTab.name}」にまとめたToDo。`
    : activeView === "all"
      ? "すべての仕事をまとめて確認できます。"
      : `${viewLabels[activeView]}の仕事を確認しています。`;
  const filterLabel = activeView !== "all"
    ? `${activeTab ? `${activeTab.name} × ` : ""}${viewLabels[activeView]}`
    : search.trim()
      ? `検索：${search.trim()}`
      : "";
  const sectionTitle = activeTab ? `${activeTab.name}・${viewLabels[activeView]}` : viewLabels[activeView];
  const emptyTitle = activeView === "trash" && !search
    ? "ゴミ箱は空です"
    : search
    ? "検索に一致するToDoがありません"
    : `${sectionTitle}はありません`;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="ToDoの表示切替">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">と</span>
        </div>

        <nav className="side-nav">
          {primaryViews.map((view) => (
            <button
              className={activeView === view ? "nav-item active" : "nav-item"}
              key={view}
              onClick={() => setActiveView(view)}
              type="button"
            >
              <ViewIcon view={view} />
              <span>{view === "today" ? "今日" : viewLabels[view]}</span>
              <span className="nav-count">{counts[view]}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-tool sidebar-settings" onClick={() => setIsDataManagerOpen(true)}>
            <SlidersHorizontal size={20} />
            <span>設定</span>
          </button>
          <button
            type="button"
            className={activeView === "trash" ? "sidebar-tool sidebar-trash active" : "sidebar-tool sidebar-trash"}
            onClick={() => setActiveView("trash")}
          >
            <Trash size={20} />
            <span>ゴミ箱</span>
            <span className="nav-count">{trashTaskCount}</span>
          </button>
          <div className="sidebar-profile">
            <span className="sidebar-profile-icon"><User size={19} /></span>
            <div>
              <strong>個人利用</strong>
              <span>この端末に保存</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="workspace-header">
          <div className="product-bar">
            <div className="product-wordmark">
              <strong>ととのうToDo</strong>
              <span>毎日の仕事を、軽やかに。</span>
            </div>
            <div className="header-actions">
              {activeView !== "trash" && (
                <button className="primary-button desktop-create" type="button" onClick={openCreateForm}>
                  <Plus size={19} weight="bold" /> ToDoを追加
                </button>
              )}
              <details className="header-menu">
                <summary aria-label="その他の操作"><DotsThree size={22} weight="bold" /></summary>
                <div>
                  <button type="button" onClick={openTabManager}><Plus size={17} /> タブを管理</button>
                  <button type="button" onClick={() => setIsDataManagerOpen(true)}><Database size={17} /> データ管理</button>
                  <button type="button" onClick={() => setActiveView("trash")}><Trash size={17} /> ゴミ箱</button>
                </div>
              </details>
            </div>
          </div>

          <div className="workspace-heading">
            <div>
              <p className="eyebrow">ワークスペース</p>
              <div className="workspace-title-row">
                <span className="workspace-title-icon" aria-hidden="true">
                  {activeTab ? <UsersThree size={30} weight="regular" /> : <ListBullets size={29} weight="regular" />}
                </span>
                <h1>{workspaceTitle}</h1>
                <span className="workspace-count">{visibleTasks.length}件</span>
              </div>
              <p className="workspace-description">{workspaceDescription}</p>
            </div>
            <p className="today-label">{todayText}</p>
          </div>

          {(filterLabel || search) && (
            <div className="active-filter-row">
              <strong><Funnel size={17} /> フィルター</strong>
              {filterLabel && (
                <span className="active-filter-chip">
                  {filterLabel}
                  <button type="button" onClick={clearFilterConditions} aria-label="表示条件を解除"><X size={14} /></button>
                </span>
              )}
              <button type="button" className="clear-filter-button" onClick={clearFilterConditions}>条件を解除</button>
            </div>
          )}
        </header>

        <section className="scope-toolbar" aria-label="ToDoのタブ切替">
          <nav className="custom-tab-list" aria-label="カスタムタブ">
            <div className={`custom-tab-shell all-tab-shell${activeTabId === "all" ? " selected" : ""}`}>
              <span className="tab-leading-icon" aria-hidden="true"><ListBullets size={18} /></span>
              <button
                type="button"
                className={activeTabId === "all" ? "custom-tab active" : "custom-tab"}
                onClick={() => setActiveTabId("all")}
                aria-pressed={activeTabId === "all"}
              >
                <span>すべてのToDo</span>
                <small>{activeTaskCount}</small>
              </button>
            </div>
            {tabs.length === 0 ? (
              <span className="tabs-empty-hint">タブを追加すると、仕事ごとに切り替えられます</span>
            ) : tabs.map((tab) => {
              const tabCount = tasks.filter((task) => task.tabId === tab.id && !isDeleted(task)).length;
              return (
                <div
                  className={`custom-tab-shell${activeTabId === tab.id ? " selected" : ""}${draggingTabId === tab.id ? " dragging" : ""}${touchDropTargetKey === `tab:${tab.id}` ? " touch-drop-target" : ""}`}
                  key={tab.id}
                  data-todo-tab-id={tab.id}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => handleTabDrop(event, tab.id)}
                >
                  <button
                    type="button"
                    className="tab-drag-handle"
                    draggable
                    aria-label={`${tab.name}をドラッグして並び替え`}
                    title="ドラッグで並び替え（スマホは押さえたまま移動／Alt＋左右キーにも対応）"
                    onDragStart={(event) => {
                      setDraggingTabId(tab.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-todo-tab", tab.id);
                    }}
                    onDragEnd={() => setDraggingTabId(null)}
                    onKeyDown={(event) => handleTabHandleKeyDown(event, tab)}
                    onTouchStart={(event) => handleTabTouchStart(event, tab.id)}
                    onTouchMove={handleTabTouchMove}
                    onTouchEnd={() => handleTabTouchEnd(tab.id)}
                    onTouchCancel={clearTouchDragState}
                  >
                    <DotsSixVertical size={18} weight="bold" />
                  </button>
                  <button
                    type="button"
                    className={activeTabId === tab.id ? "custom-tab active" : "custom-tab"}
                    onClick={() => setActiveTabId(tab.id)}
                    aria-pressed={activeTabId === tab.id}
                  >
                    <span>{tab.name}</span>
                    <small>{tabCount}</small>
                  </button>
                </div>
              );
            })}
          </nav>
          <button type="button" className="add-tab-button" onClick={openTabManager}>
            <Plus size={18} /> 新しいタブ
          </button>
        </section>

        <div className={`workspace-grid${isDetailPanelOpen && selectedTask ? " detail-open" : " detail-closed"}`}>
        <section className="task-section" aria-labelledby="task-list-heading">
          <div className="section-toolbar">
            <div className="section-summary">
              <h2 id="task-list-heading">{visibleTasks.length}件のToDo</h2>
              <p>{sectionTitle}</p>
            </div>
            <div className="toolbar-actions">
              {activeView === "trash" ? (
                <span className="trash-mode-note">ゴミ箱は一覧表示です</span>
              ) : (
                <div className="display-switch" role="group" aria-label="表示方法">
                <button
                  type="button"
                  className={displayMode === "list" ? "active" : ""}
                  onClick={() => switchDisplayMode("list")}
                >
                  <ListBullets size={18} /> 一覧
                </button>
                <button
                  type="button"
                  className={displayMode === "kanban" ? "active" : ""}
                  onClick={() => switchDisplayMode("kanban")}
                >
                  <Kanban size={18} /> かんばん
                </button>
                <button
                  type="button"
                  className={displayMode === "gantt" ? "active" : ""}
                  onClick={() => switchDisplayMode("gantt")}
                >
                  <ChartBarHorizontal size={18} /> ガント
                </button>
                </div>
              )}
              <div className="search-box">
                <MagnifyingGlass size={18} aria-hidden="true" />
                <label className="sr-only" htmlFor="task-search">ToDoを検索</label>
                <input
                  id="task-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="検索"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label="検索をクリア"><X size={15} /></button>
                )}
              </div>
            </div>
          </div>

          {storageError && (
            <div className="error-banner" role="alert">
              端末内の保存領域を利用できません。ブラウザのプライベートモードや保存設定をご確認ください。
            </div>
          )}
          {!isLoading && visibleTasks.length > 0 && effectiveDisplayMode === "kanban" && (
            <div className="kanban-wrap">
              <p className="view-hint">カード左のハンドルをドラッグして並び替え・列移動。タイトルはダブルクリック、または編集ボタンから変更できます。</p>
              <div className="kanban-board" aria-label="かんばんボード">
                {(Object.keys(statusLabels) as TaskStatus[]).map((status) => {
                  const columnTasks = visibleTasks.filter((task) => task.status === status);
                  return (
                    <div
                      className={`kanban-column kanban-${status}${touchDropTargetKey === `kanban:${status}` ? " touch-drop-target" : ""}`}
                      key={status}
                      data-kanban-status={status}
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
                              className={`kanban-card${draggingTaskId === task.id ? " dragging" : ""}${pastingTaskId === task.id ? " pasting" : ""}${touchDropTargetKey === `task:${task.id}` ? " touch-drop-target" : ""}`}
                              key={task.id}
                              tabIndex={0}
                              data-todo-task-id={task.id}
                              data-todo-task-status={task.status}
                              data-task-keep-status="false"
                              onPaste={(event) => void handleCardPaste(event, task)}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(event) => handleTaskCardDrop(event, task, false)}
                            >
                              <div className="kanban-title-row">
                                <button
                                  type="button"
                                  className="task-drag-handle"
                                  draggable={editingTitleId !== task.id}
                                  aria-label={`${task.title}をドラッグして並び替え`}
                                  title="ドラッグで並び替え（スマホは押さえたまま移動／Alt＋上下キーにも対応）"
                                  onDragStart={(event) => handleTaskDragStart(event, task)}
                                  onDragEnd={() => setDraggingTaskId(null)}
                                  onKeyDown={(event) => handleTaskHandleKeyDown(event, task, columnTasks)}
                                  onTouchStart={(event) => handleTaskTouchStart(event, task)}
                                  onTouchMove={handleTaskTouchMove}
                                  onTouchEnd={() => handleTaskTouchEnd(task)}
                                  onTouchCancel={clearTouchDragState}
                                >
                                  <DotsSixVertical size={18} weight="bold" />
                                </button>
                                {renderInlineTitle(task, "kanban-card-title")}
                                {editingTitleId !== task.id && (
                                  <button
                                    type="button"
                                    className="title-quick-edit"
                                    onClick={() => beginInlineTitleEdit(task)}
                                    aria-label={`${task.title}のタイトルを直接編集`}
                                    title="タイトルを直接編集"
                                  >
                                    <PencilSimple size={15} />
                                  </button>
                                )}
                              </div>
                              <button className="kanban-detail-edit" type="button" onClick={() => openEditForm(task)}>
                                詳細を編集
                              </button>
                              {task.tags.length > 0 && (
                                <div className="tag-row">
                                  {task.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
                                </div>
                              )}
                              {task.tabId && tabNameById.has(task.tabId) && (
                                <span className="task-tab-badge">{tabNameById.get(task.tabId)}</span>
                              )}
                              {task.description && <p>{task.description}</p>}
                              <div className="kanban-card-meta">
                                <span className={`due-label ${deadline.tone}`}><Clock size={14} /> {deadline.label}</span>
                                {task.reminderAt && <span><Bell size={14} /> 通知 {formatDateTime(task.reminderAt)}</span>}
                                {task.recurrence !== "none" && <span><Repeat size={14} /> {recurrenceLabels[task.recurrence]}</span>}
                                {task.assignee && <span>担当 {task.assignee}</span>}
                                {task.attachments.length > 0 && <span>添付 {task.attachments.length}件</span>}
                              </div>
                              {task.attachments.find((attachment) => attachment.type.startsWith("image/")) && (() => {
                                const image = task.attachments.find((attachment) => attachment.type.startsWith("image/"))!;
                                return (
                                  <button
                                    type="button"
                                    className="kanban-image-preview"
                                    onClick={(event) => openImagePreview(image, task.title, event.currentTarget)}
                                  >
                                    <Paperclip size={15} /> {image.name}を表示
                                  </button>
                                );
                              })()}
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
                        <Plus size={17} /> ToDoを追加
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!isLoading && visibleTasks.length > 0 && effectiveDisplayMode === "gantt" && (
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
                  <button type="button" onClick={() => shiftTimeline(-GANTT_DAYS)} aria-label="前の14日"><CaretLeft size={17} /></button>
                  <button type="button" onClick={resetTimeline}>今日</button>
                  <button type="button" onClick={() => shiftTimeline(GANTT_DAYS)} aria-label="次の14日"><CaretRight size={17} /></button>
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
                          {task.reminderAt && <small className="gantt-reminder"><Bell size={13} /> 通知 {formatDateTime(task.reminderAt)}</small>}
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
              <div className="empty-symbol" aria-hidden="true"><CheckCircle size={38} weight="regular" /></div>
              <h3>{emptyTitle}</h3>
              <p>
                {activeView === "trash"
                  ? "削除したToDoはここに残ります。自動では完全削除されません。"
                  : activeView === "all" && !search
                  ? "まずは、気になっている仕事をひとつ登録してみましょう。"
                  : "表示条件を変えると、別のToDoを確認できます。"}
              </p>
              {activeView === "all" && !search && (
                <button className="secondary-button" type="button" onClick={openCreateForm}>
                  最初のToDoを登録
                </button>
              )}
            </div>
          ) : effectiveDisplayMode === "list" ? (
            <div className="list-view">
              <div className="task-table-header" aria-hidden="true">
                <span>タイトル</span>
                <span>期限</span>
                <span>ステータス</span>
              </div>
              <div className="task-list">
              {visibleTasks.map((task) => {
                const deadline = dueLabel(task);
                return (
                  <article
                    className={`${activeView === "trash" ? "task-card trashed" : isComplete(task) ? "task-card completed" : "task-card"}${deadline.tone === "danger" ? " overdue-row" : ""}${selectedTask?.id === task.id && isDetailPanelOpen ? " selected" : ""}${draggingTaskId === task.id ? " dragging" : ""}${pastingTaskId === task.id ? " pasting" : ""}${touchDropTargetKey === `task:${task.id}` ? " touch-drop-target" : ""}`}
                    key={task.id}
                    tabIndex={0}
                    aria-label={`${task.title}の詳細を表示`}
                    data-todo-task-id={activeView !== "trash" ? task.id : undefined}
                    data-todo-task-status={activeView !== "trash" ? task.status : undefined}
                    data-task-keep-status={activeView !== "trash" ? "true" : undefined}
                    onPaste={activeView !== "trash" ? (event) => void handleCardPaste(event, task) : undefined}
                    onDragOver={activeView !== "trash" ? (event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    } : undefined}
                    onDrop={activeView !== "trash" ? (event) => handleTaskCardDrop(event, task, true) : undefined}
                    onClick={() => {
                      if (activeView === "trash") return;
                      setSelectedTaskId(task.id);
                      setIsDetailPanelOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (activeView !== "trash" && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        setSelectedTaskId(task.id);
                        setIsDetailPanelOpen(true);
                      }
                    }}
                  >
                    {activeView === "trash" ? (
                      <span className="trash-card-icon" aria-hidden="true"><Trash size={20} /></span>
                    ) : (
                      <button
                        type="button"
                        className="complete-button"
                        onClick={() => void toggleComplete(task)}
                        aria-label={isComplete(task) ? `${task.title}を未着手に戻す` : `${task.title}を完了にする`}
                      >
                        <CheckCircle size={22} weight={isComplete(task) ? "fill" : "regular"} aria-hidden="true" />
                      </button>
                    )}

                    {activeView !== "trash" ? (
                      <button
                        type="button"
                        className="task-drag-handle"
                        draggable={editingTitleId !== task.id}
                        aria-label={`${task.title}をドラッグして並び替え`}
                        title="ドラッグで並び替え（スマホは押さえたまま移動／Alt＋上下キーにも対応）"
                        onDragStart={(event) => handleTaskDragStart(event, task)}
                        onDragEnd={() => setDraggingTaskId(null)}
                        onKeyDown={(event) => handleTaskHandleKeyDown(event, task, visibleTasks)}
                        onTouchStart={(event) => handleTaskTouchStart(event, task)}
                        onTouchMove={handleTaskTouchMove}
                        onTouchEnd={() => handleTaskTouchEnd(task)}
                        onTouchCancel={clearTouchDragState}
                      >
                        <DotsSixVertical size={18} weight="bold" />
                      </button>
                    ) : <span className="task-drag-placeholder" />}

                    <div className="task-title-cell">
                      <div className="task-title-row">
                        <h3>{activeView === "trash" ? task.title : renderInlineTitle(task, "task-title-button")}</h3>
                        {activeView !== "trash" && editingTitleId !== task.id && (
                          <button
                            type="button"
                            className="title-quick-edit"
                            onClick={() => beginInlineTitleEdit(task)}
                            aria-label={`${task.title}のタイトルを直接編集`}
                            title="タイトルを直接編集"
                          >
                            <PencilSimple size={15} />
                          </button>
                        )}
                      </div>
                      <div className="task-row-tags" aria-label="タグと所属タブ">
                        {task.tags.slice(0, 2).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
                        {task.tabId && tabNameById.has(task.tabId) && activeTabId === "all" && (
                          <span className="task-tab-badge">{tabNameById.get(task.tabId)}</span>
                        )}
                        {task.attachments.length > 0 && <span className="attachment-count"><Paperclip size={13} /> {task.attachments.length}</span>}
                      </div>
                    </div>

                    <div className={`task-due-cell ${deadline.tone}`}>
                      <Clock size={16} aria-hidden="true" />
                      <span>{deadline.label}</span>
                    </div>
                    <div className="task-status-cell">
                      <span className={`status-badge status-${task.status}`}>{statusLabels[task.status]}</span>
                    </div>
                    {activeView === "trash" ? (
                      <div className="trash-row-actions">
                        <button type="button" className="restore-action" onClick={() => void restoreTask(task)}><ArrowCounterClockwise size={16} /> 元に戻す</button>
                        <button type="button" className="delete-action" onClick={() => void permanentlyDeleteTask(task)}>完全に削除</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="task-row-menu"
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setIsDetailPanelOpen(true);
                        }}
                        aria-label={`${task.title}の詳細を表示`}
                      >
                        <DotsThree size={20} weight="bold" />
                      </button>
                    )}
                  </article>
                );
              })}
              </div>
            </div>
          ) : null}
        </section>
        {isDetailPanelOpen && selectedTask && effectiveDisplayMode === "list" && activeView !== "trash" && (
          <aside className={`task-detail-panel ${selectedTaskId ? "user-selected" : "auto-selected"}`} aria-label={`${selectedTask.title}の詳細`} onPaste={(event) => void handleCardPaste(event, selectedTask)}>
            <header className="detail-panel-header">
              <div>
                <div className="detail-title-row">
                  {renderInlineTitle(selectedTask, "detail-title-button", false)}
                  <span className={`status-badge status-${selectedTask.status}`}>{statusLabels[selectedTask.status]}</span>
                </div>
                <span className="detail-updated">更新 {formatCreatedAt(selectedTask.updatedAt)}</span>
              </div>
              <button type="button" onClick={() => setIsDetailPanelOpen(false)} aria-label="詳細を閉じる"><X size={20} /></button>
            </header>

            <div className="detail-panel-body">
              <section className="detail-section detail-deadline">
                <div className="detail-section-label"><CalendarBlank size={18} /><span>期限</span></div>
                <strong className={selectedTaskDeadline?.tone}>{selectedTaskDeadline?.label}</strong>
              </section>

              <label className="detail-section detail-status-select">
                <span className="detail-section-label"><CheckCircle size={18} /> ステータス</span>
                <select value={selectedTask.status} onChange={(event) => void moveTaskStatus(selectedTask, event.target.value as TaskStatus)}>
                  {(Object.keys(statusLabels) as TaskStatus[]).map((status) => (
                    <option value={status} key={status}>{statusLabels[status]}</option>
                  ))}
                </select>
              </label>

              <section className="detail-section">
                <div className="detail-section-label"><Tag size={18} /><span>タグ</span></div>
                <div className="detail-tag-list">
                  {selectedTask.tags.length > 0
                    ? selectedTask.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)
                    : <span className="detail-empty">未設定</span>}
                </div>
              </section>

              {(selectedTask.requester || selectedTask.assignee) && (
                <section className="detail-section">
                  <div className="detail-section-label"><User size={18} /><span>依頼情報</span></div>
                  <div className="detail-people">
                    {selectedTask.requester && <span><small>依頼元</small>{selectedTask.requester}</span>}
                    {selectedTask.assignee && <span><small>依頼先</small>{selectedTask.assignee}</span>}
                  </div>
                </section>
              )}

              <section className="detail-section detail-history">
                <div className="detail-section-label"><Clock size={18} /><span>日時</span></div>
                <div>
                  {selectedTask.startAt && <span><small>開始</small>{formatDateTime(selectedTask.startAt)}</span>}
                  <span><small>登録</small>{formatCreatedAt(selectedTask.createdAt)}</span>
                </div>
              </section>

              {selectedTask.description && (
                <section className="detail-section detail-memo">
                  <div className="detail-section-label"><PencilSimple size={18} /><span>メモ</span></div>
                  <p>{selectedTask.description}</p>
                </section>
              )}

              {(selectedTask.reminderAt || selectedTask.recurrence !== "none") && (
                <section className="detail-section detail-automation">
                  {selectedTask.reminderAt && <span><Bell size={17} /> 通知 {formatDateTime(selectedTask.reminderAt)}</span>}
                  {selectedTask.recurrence !== "none" && <span><Repeat size={17} /> {recurrenceLabels[selectedTask.recurrence]}</span>}
                </section>
              )}

              <section className="detail-section detail-attachments">
                <div className="detail-section-label"><Paperclip size={18} /><span>添付ファイル</span><small>{selectedTask.attachments.length}</small></div>
                {selectedTask.attachments.length > 0 ? selectedTask.attachments.map((attachment) => (
                  <button
                    type="button"
                    key={attachment.id}
                    onClick={(event) => openImagePreview(attachment, selectedTask.title, event.currentTarget)}
                  >
                    <Paperclip size={15} />
                    <span>{attachment.name}</span>
                    <small>{formatBytes(attachment.size)}</small>
                  </button>
                )) : <p className="detail-empty">スクリーンショットは、このパネル上で貼り付けできます。</p>}
              </section>
            </div>

            <footer className="detail-panel-actions">
              <button type="button" className="secondary-button" onClick={() => openEditForm(selectedTask)}><PencilSimple size={17} /> 詳細を編集</button>
              <button type="button" className="detail-complete-button" onClick={() => void toggleComplete(selectedTask)}>
                <CheckCircle size={18} /> {isComplete(selectedTask) ? "未着手に戻す" : "このToDoを完了する"}
              </button>
              <button type="button" className="detail-delete-button" onClick={() => void deleteTask(selectedTask)}><Trash size={16} /> ゴミ箱へ</button>
            </footer>
          </aside>
        )}
        </div>
      </main>

      {activeView !== "trash" && (
        <button className="mobile-create-button" type="button" onClick={openCreateForm} aria-label="新しいToDoを登録">
          <Plus size={20} weight="bold" aria-hidden="true" /> <span>追加</span>
        </button>
      )}

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
              <button type="button" className="modal-close" onClick={closeForm} aria-label="閉じる"><X size={20} /></button>
            </header>

            <form onSubmit={handleSubmit}>
              <div className="form-scroll">
                {!editingId && templates.length > 0 && (
                  <label className="template-picker">
                    <span>テンプレートから作成</span>
                    <select
                      value=""
                      onChange={(event) => {
                        const template = templates.find((item) => item.id === event.target.value);
                        if (template) applyTemplate(template);
                      }}
                    >
                      <option value="">テンプレートを選択</option>
                      {templates.map((template) => (
                        <option value={template.id} key={template.id}>{template.name}</option>
                      ))}
                    </select>
                    <small>適用後に内容を確認・修正してから登録できます。</small>
                  </label>
                )}
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
                  <div className="form-field date-time-field">
                    <span>開始日</span>
                    <div className="date-time-inputs">
                      <input
                        type="date"
                        aria-label="開始日"
                        value={form.startAt}
                        onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))}
                      />
                      {form.startHasTime && (
                        <input
                          type="time"
                          aria-label="開始時刻"
                          value={form.startTime}
                          onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                        />
                      )}
                    </div>
                    <label className="time-toggle">
                      <input
                        type="checkbox"
                        checked={form.startHasTime}
                        onChange={(event) => setForm((current) => ({ ...current, startHasTime: event.target.checked }))}
                      />
                      <span>時間も指定</span>
                    </label>
                    <small className="field-help">初期設定は日付のみです</small>
                  </div>
                  <div className="form-field date-time-field">
                    <span>期限日</span>
                    <div className="date-time-inputs">
                      <input
                        type="date"
                        aria-label="期限日"
                        value={form.dueAt}
                        onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))}
                      />
                      {form.dueHasTime && (
                        <input
                          type="time"
                          aria-label="期限時刻"
                          value={form.dueTime}
                          onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))}
                        />
                      )}
                    </div>
                    <label className="time-toggle">
                      <input
                        type="checkbox"
                        checked={form.dueHasTime}
                        onChange={(event) => setForm((current) => ({ ...current, dueHasTime: event.target.checked }))}
                      />
                      <span>時間も指定</span>
                    </label>
                    <small className="field-help">日付のみの期限は、その日の終わりまで有効です</small>
                  </div>
                  <label className="form-field">
                    <span>リマインダー</span>
                    <input
                      type="datetime-local"
                      value={form.reminderAt}
                      onChange={(event) => setForm((current) => ({ ...current, reminderAt: event.target.value }))}
                    />
                    <small className="field-help">画面を開いている間に通知します</small>
                  </label>
                  <label className="form-field">
                    <span>繰り返し</span>
                    <select
                      value={form.recurrence}
                      onChange={(event) => setForm((current) => ({ ...current, recurrence: event.target.value as Recurrence }))}
                    >
                      {(Object.keys(recurrenceLabels) as Recurrence[]).map((recurrence) => (
                        <option value={recurrence} key={recurrence}>{recurrenceLabels[recurrence]}</option>
                      ))}
                    </select>
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

                <button type="button" className="template-save-button" onClick={() => void saveCurrentAsTemplate()}>
                  ☆ 現在の内容をテンプレートとして保存
                </button>

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
                    <strong><Paperclip size={17} aria-hidden="true" /> ファイルを選ぶ</strong>
                    <small>1ファイル8MB・合計20MB・最大10件まで</small>
                  </label>
                  {form.attachments.length > 0 && (
                    <div className="selected-files">
                      {form.attachments.map((attachment) => (
                        <div key={attachment.id}>
                          <span><b>{attachment.name}</b><small>{formatBytes(attachment.size)}</small></span>
                          {attachment.type.startsWith("image/") && (
                            <button
                              type="button"
                              className="preview-file-button"
                              onClick={(event) => openImagePreview(attachment, form.title || "編集中のToDo", event.currentTarget)}
                            >
                              表示
                            </button>
                          )}
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
                <X size={20} />
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
                  const tabCount = tasks.filter((task) => task.tabId === tab.id && !isDeleted(task)).length;
                  return (
                    <div className="tab-manager-item" key={tab.id}>
                      <span className="tab-manager-icon" aria-hidden="true"><Tag size={17} /></span>
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

      {isDataManagerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isProcessingData) setIsDataManagerOpen(false);
        }}>
          <section className="data-modal" role="dialog" aria-modal="true" aria-labelledby="data-manager-title">
            <header className="modal-header">
              <div>
                <p>BACKUP & SETTINGS</p>
                <h2 id="data-manager-title">データ管理</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsDataManagerOpen(false)}
                aria-label="閉じる"
                disabled={isProcessingData}
              >
                <X size={20} />
              </button>
            </header>
            <div className="data-manager-content">
              <p className="data-manager-lead">
                現在はこの端末だけに保存しています。バックアップにはToDo・タブ・ゴミ箱・添付・テンプレートがすべて含まれます。
              </p>

              <div className="storage-summary" aria-label="保存状況">
                <span><strong>{activeTaskCount}</strong><small>使用中ToDo</small></span>
                <span><strong>{trashTaskCount}</strong><small>ゴミ箱</small></span>
                <span><strong>{totalAttachmentCount}</strong><small>添付</small></span>
                <span><strong>{formatBytes(totalAttachmentSize)}</strong><small>添付容量</small></span>
              </div>

              <section className="data-panel">
                <div>
                  <strong>① バックアップを保存</strong>
                  <p>別の場所へ保管できるJSONファイルを作成します。添付画像も含まれます。</p>
                </div>
                <button type="button" className="primary-button" onClick={() => void exportBackup()} disabled={isProcessingData}>
                  {isProcessingData ? "処理中…" : "バックアップを保存"}
                </button>
              </section>

              <section className="data-panel restore-panel">
                <div>
                  <strong>② バックアップを復元</strong>
                  <p>復元前に内容を検証します。成功した場合のみ、現在のデータを置き換えます。</p>
                </div>
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void restoreBackup(file);
                  }}
                  disabled={isProcessingData}
                />
                <button type="button" className="secondary-button" onClick={() => restoreInputRef.current?.click()} disabled={isProcessingData}>
                  バックアップを選択
                </button>
              </section>

              <section className="data-panel notification-panel">
                <div>
                  <strong>リマインダー通知</strong>
                  <p>この画面を開いている間に確認し、許可済みならブラウザ通知も表示します。</p>
                </div>
                <span className={`permission-status permission-${notificationPermission}`}>
                  {notificationPermission === "granted"
                    ? "通知：許可済み"
                    : notificationPermission === "denied"
                      ? "通知：ブロック中"
                      : notificationPermission === "unsupported"
                        ? "通知：未対応"
                        : "通知：未設定"}
                </span>
                {notificationPermission === "default" && (
                  <button type="button" className="secondary-button" onClick={() => void requestReminderPermission()}>
                    通知を許可する
                  </button>
                )}
              </section>

              <section className="template-manager-panel">
                <header>
                  <div>
                    <strong>定型テンプレート</strong>
                    <p>ToDo入力画面の「テンプレートとして保存」から追加できます。</p>
                  </div>
                  <span>{templates.length}件</span>
                </header>
                {templates.length === 0 ? (
                  <div className="template-manager-empty">保存済みテンプレートはありません。</div>
                ) : (
                  <div className="template-manager-list">
                    {templates.map((template) => (
                      <div key={template.id}>
                        <span><strong>{template.name}</strong><small>{template.title}</small></span>
                        <button type="button" onClick={() => createFromTemplate(template)}>この内容で作成</button>
                        <button type="button" className="delete-action" onClick={() => void deleteTemplate(template)}>削除</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>
      )}

      {previewTarget && (
        <div className="modal-backdrop preview-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeImagePreview();
        }}>
          <section className="image-preview-modal" role="dialog" aria-modal="true" aria-labelledby="image-preview-title">
            <header className="modal-header">
              <div>
                <p>{previewTarget.taskTitle}</p>
                <h2 id="image-preview-title">{previewTarget.attachment.name}</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeImagePreview} aria-label="閉じる"><X size={20} /></button>
            </header>
            <div className="image-preview-stage">
              {previewUrl && !previewLoadError && (
                <img src={previewUrl} alt={previewTarget.attachment.name} onError={() => setPreviewLoadError(true)} />
              )}
              {previewLoadError && <p>画像を表示できません。下の「画像を保存」から確認できます。</p>}
            </div>
            <footer className="image-preview-footer">
              <span>{formatBytes(previewTarget.attachment.size)}</span>
              <button type="button" className="secondary-button" onClick={() => downloadAttachment(previewTarget.attachment)}>画像を保存</button>
              <button type="button" className="primary-button" onClick={closeImagePreview}>閉じる</button>
            </footer>
          </section>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          {undoDelete?.message === notice && (
            <button type="button" onClick={() => void undoLastDelete()}>元に戻す</button>
          )}
        </div>
      )}
    </div>
  );
}
