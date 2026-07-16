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

  const { public_key } = await api.get("/api/push/vapid-public-key");
  let applicationServerKey: Uint8Array<ArrayBuffer>;
  try {
    applicationServerKey = urlBase64ToUint8Array(public_key);
  } catch {
    applicationServerKey = new Uint8Array(new ArrayBuffer(0));
  }
  // A valid VAPID key is an uncompressed P-256 point: exactly 65 bytes,
  // leading 0x04. Anything else means the server-side key is missing or
  // malformed — catch it here with a clear message instead of letting
  // pushManager.subscribe() reject with an opaque WebKit parsing error.
  if (applicationServerKey.length !== 65 || applicationServerKey[0] !== 0x04) {
    throw new Error("Push notifications aren't available right now");
  }

  const registration = await navigator.serviceWorker.ready;

  // A stale subscription created with a different (e.g. rotated) VAPID key
  // makes subscribe() reject rather than transparently re-subscribe — clear
  // it first so this always converges to a subscription under the current
  // key instead of silently failing and leaving the old one in place.
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch {
    throw new Error("Push notifications aren't available right now");
  }

  const json = subscription.toJSON();
  await api.post("/api/push/subscribe", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  });

  return subscription;
}

export async function unsubscribeFromPush() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;

  await api.delete("/api/push/subscribe", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
