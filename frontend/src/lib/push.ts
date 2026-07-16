import { api } from "@/lib/api";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// iOS Safari's PushSubscription.toJSON() has real, long-standing bugs
// serializing the key material (throws a native "string did not match the
// expected pattern" error rather than returning JSON). Read the raw key
// bytes via getKey() and base64url-encode them ourselves instead of relying
// on toJSON().
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getCurrentPushSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush() {
  if (!pushSupported()) {
    throw new Error("Push notifications aren't supported in this browser");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  let public_key: string;
  try {
    ({ public_key } = await api.get("/api/push/vapid-public-key"));
  } catch (err) {
    throw new Error(
      `[fetch-key] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let applicationServerKey: Uint8Array<ArrayBuffer>;
  try {
    applicationServerKey = urlBase64ToUint8Array(public_key);
  } catch (err) {
    throw new Error(
      `[decode-key len=${public_key?.length ?? "null"}] ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // A valid VAPID key is an uncompressed P-256 point: exactly 65 bytes,
  // leading 0x04. Anything else means the server-side key is missing or
  // malformed.
  if (applicationServerKey.length !== 65 || applicationServerKey[0] !== 0x04) {
    throw new Error(
      `[bad-key bytes=${applicationServerKey.length} first=${applicationServerKey[0]}]`,
    );
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch (err) {
    throw new Error(
      `[sw-ready] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // A stale subscription created with a different (e.g. rotated) VAPID key
  // makes subscribe() reject rather than transparently re-subscribe — clear
  // it first so this always converges to a subscription under the current
  // key instead of silently failing and leaving the old one in place.
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await existing.unsubscribe();
    }
  } catch (err) {
    throw new Error(
      `[clear-existing] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "Unknown";
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[subscribe ${name}] ${message}`);
  }

  let p256dh: string;
  let auth: string;
  try {
    const p256dhKey = subscription.getKey("p256dh");
    const authKey = subscription.getKey("auth");
    if (!p256dhKey || !authKey) {
      throw new Error("missing key material on subscription");
    }
    p256dh = bufferToBase64Url(p256dhKey);
    auth = bufferToBase64Url(authKey);
  } catch (err) {
    throw new Error(
      `[serialize-subscription] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    await api.post("/api/push/subscribe", {
      endpoint: subscription.endpoint,
      keys: { p256dh, auth },
    });
  } catch (err) {
    throw new Error(
      `[save-subscription] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return subscription;
}

export async function unsubscribeFromPush() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;

  await api.delete("/api/push/subscribe", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
