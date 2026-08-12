import webpush from "web-push";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:you@example.com";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body?: string; url?: string }
) {
  ensureConfigured();
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

export function isPushConfigured() {
  return Boolean(publicKey && privateKey);
}
