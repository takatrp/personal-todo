import assert from "node:assert/strict";
import test from "node:test";
import { isValidTaskGoal, normalizeTaskGoal } from "../app/task-goal.ts";

test("legacy tasks without a goal remain usable", () => {
  for (const value of [undefined, null, 42, {}, ""]) assert.equal(normalizeTaskGoal(value), "");
});

test("goal text preserves its meaning and line breaks through JSON persistence", () => {
  const goal = normalizeTaskGoal("  方針を決める\r\n\r\n担当と次の行動を\t共有する  ");
  assert.equal(goal, "方針を決める\n\n担当と次の行動を\t共有する");
  assert.equal(normalizeTaskGoal(JSON.parse(JSON.stringify({ goal })).goal), goal);
  assert.ok(isValidTaskGoal("あ".repeat(2000)));
});

test("goal limits allow multiline context and reject other controls", () => {
  for (const value of ["x".repeat(2001), "a\u0000b", "a\u007fb", "a\u0085b"]) {
    assert.equal(isValidTaskGoal(value), false);
    assert.equal(normalizeTaskGoal(value), "");
  }
});
