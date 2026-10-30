export const MAX_TASK_GOAL_LENGTH = 2000;

// Multiline task context may contain line breaks and tabs, but no other controls.
const INVALID_GOAL_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

export function isValidTaskGoal(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TASK_GOAL_LENGTH
    && !INVALID_GOAL_CONTROLS.test(value);
}

/** Old tasks and templates have no goal; retain their existing empty-field behavior. */
export function normalizeTaskGoal(value: unknown): string {
  if (!isValidTaskGoal(value)) return "";
  return value.replace(/\r\n?/gu, "\n").trim();
}
