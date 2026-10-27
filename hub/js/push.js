// Phone notifications (web push) for this device.
// iPhone/iPad: only works when the hub is opened from its Home Screen icon (iOS 16.4+).
// Android/computers: works in Chrome, Edge, Firefox; on Safari for Mac too.
const SW = "/sw.js";

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// What this device can do right now:
//   "ios-home"   iPhone/iPad not opened from the Home Screen icon (add it first)
//   "unsupported" this browser can't do notifications
//   "blocked"    notifications were turned off for the hub in settings
//   "on" / "off"
export async function status() {
  if (isIOS() && !isStandalone()) return "ios-home";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration(SW);
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub && Notification.permission === "granted" ? "on" : "off";
}

const b64ToBytes = (s) => {
  const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

// Must be called from a tap (browsers only ask for permission then).
export async function enable(api) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications are blocked for the hub. Turn them on in your phone's settings." : "Notifications weren't allowed.");
  const reg = await navigator.serviceWorker.register(SW);
  await navigator.serviceWorker.ready;
  const { publicKey } = await api.pushKey();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with different keys won't work; start over.
  if (sub && sub.options?.applicationServerKey) {
    const have = new Uint8Array(sub.options.applicationServerKey), want = b64ToBytes(publicKey);
    if (have.length !== want.length || have.some((v, i) => v !== want[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await api.pushSubscribe(sub.toJSON(), deviceName());
}

export async function disable(api) {
  const reg = await navigator.serviceWorker.getRegistration(SW);
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  try { await api.pushUnsubscribe(sub.endpoint); } finally { await sub.unsubscribe(); }
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || isIOS()) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "This device";
}
