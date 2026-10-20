// PIN helpers. PINs are never stored. Each PIN is turned into a keyed hash
// (HMAC-SHA256 with a server-only secret, the "pepper") so the server can look
// it up directly and enforce that every PIN at a location is unique.
import { createHmac } from "node:crypto";

export const PIN_LENGTH = 4;

export function validatePin(pin) {
  const p = String(pin ?? "");
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(p)) {
    return `PIN must be exactly ${PIN_LENGTH} digits.`;
  }
  if (/^(\d)\1+$/.test(p)) return "PIN can't be all the same digit.";
  if ("0123456789".includes(p) || "9876543210".includes(p)) {
    return "PIN can't be a straight run like 1234.";
  }
  return null;
}

// Document id for the PIN index: one doc per (location, PIN).
export function pinKey(pepper, loc, pin) {
  if (!pepper) throw new Error("PIN_PEPPER secret is not set.");
  const mac = createHmac("sha256", pepper).update(`${loc}:${pin}`).digest("hex");
  return `${loc}_${mac}`;
}
