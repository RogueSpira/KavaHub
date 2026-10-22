import { test } from "node:test";
import assert from "node:assert/strict";
import { convert, copyDrivePictures, COMMUNITY_FOLDER, parseCSV, parseDate, patternFrom, fromHtml, imageFrom, slideFrom } from "../hub/tools/tv/import.js";

const today = new Date(2026, 9, 20); // Tue Oct 20 2026

test("csv with quoted commas", () => {
  assert.deepEqual(parseCSV('a,b\n"Mon, July 27","x ""y"""'), [["a", "b"], ["Mon, July 27", 'x "y"']]);
});

test("dates, including the new-year rollover", () => {
  assert.equal(parseDate("10/24", today).getDate(), 24);
  assert.equal(parseDate("Jan 3", today).getFullYear(), 2027);
  assert.equal(parseDate("Sat, Oct 31", today).getMonth(), 9);
  assert.equal(parseDate("2026-11-02", today).getMonth(), 10);
  assert.equal(parseDate("", today), null);
  assert.equal(parseDate("Every Thursday", today), null);
});

test("repeat patterns from the banner", () => {
  assert.deepEqual(patternFrom("Every Thursday 8 PM Trivia"), { repeat: "weekly", weekday: 4 });
  assert.deepEqual(patternFrom("Last Monday Monthly"), { repeat: "monthly", weekday: 1, nth: -1 });
  assert.deepEqual(patternFrom("2nd Sat"), { repeat: "monthly", weekday: 6, nth: 2 });
  assert.equal(patternFrom("Monthly comedy"), null);
});

test("html, images and slide names", () => {
  assert.equal(fromHtml("Happy Hour <b>10–11 AM</b> &amp; more"), "Happy Hour **10–11 AM** & more");
  assert.equal(fromHtml("<script>x</script>hi"), "xhi");
  assert.equal(imageFrom("christian"), "/board/assets/christian.jpg");
  assert.equal(imageFrom("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view"), "https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345=w1600");
  assert.equal(imageFrom("flyer.png"), "");
  assert.equal(slideFrom("Kavatenders"), "crew");
  assert.equal(slideFrom("spotlight"), "tonight");
  assert.equal(slideFrom("nope"), null);
});

test("convert the old sheets", () => {
  const rows = {
    employees: [["Name", "Photo"], ["Josh", ""], ["Daniel", ""], ["Wheaton", ""], ["Sam", ""]],
    schedule: [["Day", "Opener", "Closer"], ["Monday", "josh", "wheaton"], ["Tuesday", "daniel", "Kai"], ["", "", ""], ["Options:", "josh", ""]],
    events: [["Date", "Time", "Banner", "Header 1", "Details", "Host", "Image"],
      ["", "8:00 PM", "Every Thursday", "Trivia Night", "Theme: <b>80s</b>", "Christian", "christian"],
      ["10/24", "8 PM", "Costume Party", "Masquerade", "", "", ""],
      ["10/1", "8 PM", "", "Old Thing", "", "", ""],
      ["", "", "Sometimes", "Mystery", "", "", ""]],
    ticker: [["Message"], ["Follow us <b>@kava</b>"], ["(<b>bold</b> makes text gold)"]],
    specials: [["Name", "Description"], ["Mango Tango", "Yum"]],
    signature: [["Staff", "Drink", "Description", "Image"], ["Wheatyn", "Special", "Coconut", ""]],
    products: [["Name", "Blurb", "Image"], ["Kava", "Root", "christian|https://x.example/a.jpg"]],
    screens: [["Screen", "Slides", "Theme"], ["1", "welcome, kavatenders, spotlight, everyweek, feud, bogus", "orange"]],
  };
  const { sections, notes } = convert(rows, today);
  assert.deepEqual(sections.crew.roster.map((p) => p.id), ["josh", "daniel", "wheatyn", "sam", "kai"]);
  assert.equal(sections.crew.roster[2].photo, "/board/assets/crew/wheatyn.jpg");
  assert.deepEqual(sections.crew.weekly[1], { opener: "josh", closer: "wheatyn" });
  assert.deepEqual(sections.crew.weekly[2], { opener: "daniel", closer: "kai" });
  const ev = sections.events.items;
  assert.equal(ev.length, 3);
  assert.equal(ev[0].repeat, "weekly"); assert.equal(ev[0].weekday, 4); assert.equal(ev[0].featured, true);
  assert.deepEqual(ev[0].themes, { "2026-10": "Theme: **80s**" }); assert.equal(ev[0].details, undefined); assert.match(ev[0].themeNote, /last Thursday/); assert.equal(ev[0].image, "/board/assets/christian.jpg");
  assert.equal(ev[1].repeat, "once"); assert.equal(ev[1].date, "2026-10-24");
  assert.equal(ev[2].active, false);
  assert.deepEqual(sections.ticker.items, ["Follow us **@kava**"]);
  assert.deepEqual(sections.products.items[0].images, ["/board/assets/christian.jpg", "https://x.example/a.jpg"]);
  assert.deepEqual(sections.screens["1"].slides.map((s) => s.id), ["welcome", "crew", "tonight", "weekly", "feud"]);
  assert.equal(sections.screens["1"].v, 2);
  assert.equal(sections.screens["1"].theme, "orange");
  assert.equal(sections.community.driveFolder, COMMUNITY_FOLDER);
  assert.equal(sections.community.photos, undefined);
  assert.ok(notes.some((n) => n.includes("Mystery")));
  assert.ok(notes.some((n) => n.includes("1 already-past")));
});

test("Drive pictures are copied into the hub; failures are listed", async () => {
  const d = (id) => `https://lh3.googleusercontent.com/d/${id}=w1600`;
  const sections = {
    crew: { roster: [{ name: "Josh", photo: d("a") }, { name: "Kai", photo: "/board/assets/crew/josh.jpg" }] },
    events: { items: [{ title: "Trivia", image: d("b") }] },
    products: { items: [{ name: "Kava", images: [d("c"), d("bad")] }] },
    community: { driveFolder: "x" },
  };
  const seen = [];
  const { copied, failed } = await copyDrivePictures(sections, async (u) => { seen.push(u); if (u.includes("bad")) throw new Error("no"); return `/hub?media=${seen.length}`; });
  assert.equal(copied, 3); assert.deepEqual(failed, ["Kava"]);
  assert.equal(sections.crew.roster[0].photo, "/hub?media=1");
  assert.equal(sections.crew.roster[1].photo, "/board/assets/crew/josh.jpg");
  assert.deepEqual(sections.products.items[0].images, ["/hub?media=3"]);
});
