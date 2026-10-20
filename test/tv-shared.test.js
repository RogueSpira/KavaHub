import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../hub/js/tv-shared.js";
const d = (s) => T.dateOfKey(s);

test("event repeats: weekly, nth and last weekday of month, one-time, inactive, until", () => {
  const trivia = { repeat: "weekly", weekday: 4 }, comedy = { repeat: "monthly", weekday: 1, nth: -1 };
  assert.equal(T.occursOn(trivia, d("2026-10-22")), true);
  assert.equal(T.occursOn(trivia, d("2026-10-21")), false);
  assert.equal(T.occursOn(comedy, d("2026-10-26")), true);
  assert.equal(T.occursOn(comedy, d("2026-10-19")), false);
  assert.equal(T.occursOn({ repeat: "monthly", weekday: 2, nth: 2 }, d("2026-10-13")), true);
  assert.equal(T.occursOn({ repeat: "once", date: "2026-10-24" }, d("2026-10-24")), true);
  assert.equal(T.occursOn({ ...trivia, active: false }, d("2026-10-22")), false);
  assert.equal(T.occursOn({ ...trivia, until: "2026-10-15" }, d("2026-10-22")), false);
});

test("occurrences are in date then time order", () => {
  const evs = [{ title: "B", repeat: "once", date: "2026-10-24", time: "9:00 PM" }, { title: "A", repeat: "once", date: "2026-10-24", time: "7 PM" }];
  assert.deepEqual(T.occurrences(evs, d("2026-10-20"), 10).map((o) => o.ev.title), ["A", "B"]);
});

test("business day rolls over at 5 AM", () => {
  assert.equal(T.businessKey(new Date(2026, 9, 21, 1, 0)), "2026-10-20");
  assert.equal(T.businessKey(new Date(2026, 9, 21, 6, 0)), "2026-10-21");
});

test("crew: today's change beats the weekly pattern", () => {
  const crew = { roster: [{ id: "d", name: "Daniel" }, { id: "w", name: "Wheatyn" }], weekly: { 2: { opener: "d", closer: "w" } }, days: { "2026-10-20": { closer: "d" } } };
  const c = T.crewFor(crew, new Date(2026, 9, 20, 15));
  assert.equal(c.opener.name, "Daniel"); assert.equal(c.closer.name, "Daniel"); assert.equal(c.changed, true);
  const tomorrow = T.crewFor(crew, new Date(2026, 9, 27, 15));
  assert.equal(tomorrow.closer.name, "Wheatyn");
});

test("happy hour now + labels", () => {
  assert.equal(T.happyHourNow(T.DEFAULTS.happyhour.slots, new Date(2026, 9, 20, 14, 26)).minutesLeft, 94);
  assert.equal(T.happyHourNow(T.DEFAULTS.happyhour.slots, new Date(2026, 9, 20, 12, 0)), null);
  assert.equal(T.fmtRange("14:00", "16:00"), "2–4 PM");
  assert.equal(T.fmtRange("11:00", "13:00"), "11 AM–1 PM");
});

test("only safe picture addresses are shown", () => {
  assert.ok(T.okImage("/.netlify/functions/hub?media=mandarin.abc123"));
  assert.ok(T.okImage("/board/assets/crew/josh.jpg"));
  assert.ok(T.okImage("https://lh3.googleusercontent.com/d/x"));
  assert.ok(!T.okImage("javascript:alert(1)"));
  assert.ok(!T.okImage("http://insecure.example/x.png"));
});
