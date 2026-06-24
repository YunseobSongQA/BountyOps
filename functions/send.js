// GET /send?msg=텍스트 — push the given text to every stored subscriber.
// Uses the shared web-push transport in _push.js.
import { sendToAll } from "./_push.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const msg = url.searchParams.get("msg") || "테스트 알림";

  const result = await sendToAll(
    JSON.stringify({ title: "BountyOps", body: msg }),
    env
  );

  // result is { sent, failed, errors }. Reflect failures in the HTTP status so
  // callers/monitoring see a non-200 when nothing got delivered, while the body
  // always carries the detailed `errors` array for debugging.
  const status = result.failed > 0 && result.sent === 0 ? 500 : 200;
  return new Response(JSON.stringify(result), {
    status,
    headers: { "content-type": "application/json" },
  });
}
