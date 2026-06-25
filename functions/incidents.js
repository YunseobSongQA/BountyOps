// 전과 기록부(노하우 장부). 훅이 누군가를 잡을 때마다 한 줄씩 쌓인다.
//   GET /incidents?limit=50 → 최근 사건 목록 (최신순)
import { listIncidents } from "./_rules.js";

export async function onRequestGet({ request, env }) {
  if (!env.KV) {
    return new Response(JSON.stringify({ error: "KV 바인딩이 없다." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const limitParam = parseInt(new URL(request.url).searchParams.get("limit"), 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
  const incidents = await listIncidents(env, limit);
  return new Response(JSON.stringify({ incidents }), {
    headers: { "content-type": "application/json" },
  });
}
