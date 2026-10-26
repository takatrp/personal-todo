import { selectAiTitles } from "./ai-subtasks.ts";

export type AiAppendSubTask = {
  id: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
};

/** Revalidate at commit time; preserve existing records and generate identity locally. */
export function appendSuggestedSubTasks(
  current: AiAppendSubTask[],
  titles: string[],
  createId: () => string,
  now = new Date().toISOString(),
): AiAppendSubTask[] {
  const accepted = selectAiTitles(titles, current.map((item) => item.title));
  const firstOrder = current.length ? Math.max(...current.map((item) => item.sortOrder)) + 1000 : 0;
  return [...current, ...accepted.map((title, index) => ({
    id: createId(), title, sortOrder: firstOrder + index * 1000,
    createdAt: now, updatedAt: now, completedAt: "",
  }))];
}
