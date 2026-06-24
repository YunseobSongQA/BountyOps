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

  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
}
