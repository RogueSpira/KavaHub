import { test } from "node:test";
import assert from "node:assert/strict";
import { roundOf, nextRound, scheduleLabel, isRecurring } from "../hub/tools/quests/schedule.js";

test("daily quest: round is today, next is tomorrow", () => {
  const q = { every: "day" };
  assert.equal(roundOf(q, "2026-10-27"), "2026-10-27");
  assert.equal(nextRound(q, "2026-10-27"), "2026-10-28");
});

test("weekly quest: latest chosen weekday on or before today", () => {
  const q = { every: "week", on: [1, 4] }; // Mon, Thu. 2026-10-27 is a Tuesday.
  assert.equal(roundOf(q, "2026-10-27"), "2026-10-26");
  assert.equal(nextRound(q, "2026-10-27"), "2026-10-29");
  assert.equal(roundOf(q, "2026-10-29"), "2026-10-29");
  assert.equal(scheduleLabel(q), "Every Mon & Thu");
  assert.equal(scheduleLabel({ every: "week", on: [0] }), "Every Sunday");
});

test("monthly quest, including day 31 in short months", () => {
  const q = { every: "month", on: [15] };
  assert.equal(roundOf(q, "2026-10-27"), "2026-10-15");
  assert.equal(roundOf(q, "2026-10-10"), "2026-09-15");
  assert.equal(nextRound(q, "2026-10-27"), "2026-11-15");
  const last = { every: "month", on: [31] };
  assert.equal(roundOf(last, "2026-11-30"), "2026-11-30");
  assert.equal(roundOf(last, "2026-11-29"), "2026-10-31");
  assert.equal(scheduleLabel(last), "Monthly on the last day");
  assert.equal(scheduleLabel(q), "Monthly on the 15th");
});

test("start date: nothing before it, first round on/after it", () => {
  const q = { every: "week", on: [3], unlockOn: "2026-11-02" }; // Wednesdays from Nov 2
  assert.equal(roundOf(q, "2026-10-29"), "");
  assert.equal(nextRound(q, "2026-10-29"), "2026-11-04");
  assert.equal(roundOf(q, "2026-11-05"), "2026-11-04");
});

test("not recurring", () => {
  assert.equal(isRecurring({ repeat: true }), false);
  assert.equal(roundOf({ every: "" }, "2026-10-27"), "");
  assert.equal(roundOf({ every: "week", on: [] }, "2026-10-27"), "");
});
