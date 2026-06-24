// NOTE: Only the VAPID *public* key belongs in client code. The private key
// from the original prompt was intentionally omitted — it must only live in the
// server-side VAPID_PRIVATE env var, never shipped to the browser.
const VAPID_PUBLIC = "BNE7CDysBzJ-1WKEtZSQe8MW9CS0sDN8YPWp-oiRzB6Hpbj8ypm4RTeF9juaN_XrWCZsuvwTkzPRw5NEoLG6sVE";
const log = (m) => document.getElementById("log").textContent = m;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

document.getElementById("enable").addEventListener("click", async () => {
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return log("알림 권한이 거부됐어요.");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
    });
    const res = await fetch("/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub)
    });
    log(res.ok ? "알림이 켜졌습니다!" : "구독 저장 실패");
  } catch (e) {
    log("에러: " + e.message);
  }
});
