export async function onRequestPost({ request, env }) {
  try {
    const sub = await request.json();
    if (!sub || !sub.endpoint) {
      return new Response("bad subscription", { status: 400 });
    }
    await env.KV.put("sub:" + sub.endpoint, JSON.stringify(sub));
    return new Response("ok");
  } catch (e) {
    return new Response("error: " + e.message, { status: 500 });
  }
}
