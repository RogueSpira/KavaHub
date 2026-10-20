import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePin, pinKey } from "../netlify/lib/pin.js";

test("validatePin accepts normal 4-digit PINs", () => {
  for (const p of ["2580", "0417", "9130"]) assert.equal(validatePin(p), null);
});

test("validatePin rejects bad PINs", () => {
  for (const p of ["", "123", "12345", "abcd", "1111", "1234", "4321", "12 4", null]) {
    assert.notEqual(validatePin(p), null, `expected ${p} to be rejected`);
  }
});

test("pinKey is stable, location-scoped and pepper-dependent", () => {
  const a = pinKey("pepper", "mandarin", "2580");
  assert.equal(a, pinKey("pepper", "mandarin", "2580"));
  assert.notEqual(a, pinKey("pepper", "mandarin", "2581"));
  assert.notEqual(a, pinKey("pepper", "southside", "2580"));
  assert.notEqual(a, pinKey("other", "mandarin", "2580"));
  assert.ok(a.startsWith("mandarin_"));
  assert.ok(!a.includes("2580"));
  assert.throws(() => pinKey("", "mandarin", "2580"));
});
