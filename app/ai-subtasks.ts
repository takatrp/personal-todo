/** AI suggestions are untrusted text, never executable instructions or saved IDs. */
import { isValidTaskGoal, normalizeTaskGoal } from "./task-goal.ts";

export const MAX_AI_SUGGESTIONS = 8;
export const MAX_AI_TITLE_LENGTH = 160;
export const MAX_AI_PARENT_LENGTH = 120;
export const MAX_AI_CHILDREN = 100;

export function normalizeAiTitleKey(title: string): string {
  return title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ja");
}

export function isValidAiTitle(value: unknown, maxLength = MAX_AI_TITLE_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function parseAiTitles(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("titles" in value)
    || !Array.isArray(value.titles) || value.titles.length < 1
    || value.titles.length > MAX_AI_SUGGESTIONS || !value.titles.every((title) => isValidAiTitle(title))) {
    throw new Error("invalid_response");
  }
  return value.titles.map((title: string) => title.trim());
}

/** Re-evaluate against the current collection immediately before appending. */
export function selectAiTitles(titles: string[], existingTitles: string[]): string[] {
  const remaining = Math.max(0, MAX_AI_CHILDREN - existingTitles.length);
  const keys = new Set(existingTitles.map(normalizeAiTitleKey));
  const result: string[] = [];
  for (const title of titles.slice(0, MAX_AI_SUGGESTIONS)) {
    if (!isValidAiTitle(title)) continue;
    const key = normalizeAiTitleKey(title);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    if (result.length < remaining) result.push(title.trim());
  }
  return result;
}

export class AiSuggestionError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("AI suggestion request failed");
    this.status = status;
  }
}

export function aiSuggestionErrorMessage(error: unknown): string {
  const status = error instanceof AiSuggestionError ? error.status : 0;
  if (status === 401) return "ログイン状態を確認して、もう一度お試しください。";
  if (status === 403) return "このアカウントではAI提案を利用できません。";
  if (status === 429) return "AI提案の利用上限に達しました。時間をおいてお試しください。";
  if (status === 503 || status === 404) return "AI提案はまだ利用できません。設定状況を確認してください。";
  if (status === 408 || status === 504) return "AI提案が時間内に完了しませんでした。もう一度お試しください。";
  return "AI提案を取得できませんでした。手動で追加するか、時間をおいてお試しください。";
}

type AiSession = { access_token: string; user: { id: string } };
type RequestOptions = {
  title: string;
  goal?: string;
  userId: string;
  url: string;
  publishableKey: string;
  getSession: () => Promise<{ data: { session: AiSession | null }; error: unknown }>;
  signal: AbortSignal;
  fetcher?: typeof fetch;
};

/** Only the title and goal cross the network. Notes, children and contacts stay local. */
export async function requestAiSubtasks({
  title, goal = "", userId, url, publishableKey, getSession, signal, fetcher = fetch,
}: RequestOptions): Promise<string[]> {
  signal.throwIfAborted();
  if (!isValidAiTitle(title.trim(), MAX_AI_PARENT_LENGTH)) throw new AiSuggestionError(400);
  if (!isValidTaskGoal(goal)) throw new AiSuggestionError(400);
  if (!url || !publishableKey) throw new AiSuggestionError(503);
  const { data, error } = await getSession();
  signal.throwIfAborted();
  if (error || !data.session || data.session.user.id !== userId) throw new AiSuggestionError(401);
  const response = await fetcher(`${url.replace(/\/$/u, "")}/functions/v1/suggest-subtasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ title: title.trim(), goal: normalizeTaskGoal(goal) }),
    signal,
  });
  signal.throwIfAborted();
  if (!response.ok) throw new AiSuggestionError(response.status);
  // Bound response bytes even when a malfunctioning endpoint ignores its own limits.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("invalid_response");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) throw new Error("invalid_response");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  return parseAiTitles(JSON.parse(text));
}
