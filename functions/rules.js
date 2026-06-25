// 수배령(규칙) 장부 CRUD.
//   GET    /rules?project=owner/repo  → { common:[...], project:[...], defaults:[...] }
//   POST   /rules                     → 수배령 등록/수정 (본문에 rule JSON)
//   DELETE /rules?scope=&project=&id= → 수배령 폐기
import {
  listUserRules,
  saveRule,
  deleteRule,
  DEFAULT_RULES,
} from "./_rules.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function onRequestGet({ request, env }) {
  if (!env.KV) return json({ error: "KV 바인딩이 없다." }, 500);
  const project = new URL(request.url).searchParams.get("project") || null;
  const { common, project: proj } = await listUserRules(env, project);
  return json({ common, project: proj, defaults: DEFAULT_RULES });
}

export async function onRequestPost({ request, env }) {
  if (!env.KV) return json({ error: "KV 바인딩이 없다." }, 500);
  let body = {};
  try { body = await request.json(); } catch (_) {
    return json({ error: "본문이 엉터리다(JSON 아님)." }, 400);
  }
  try {
    const rule = await saveRule(env, body);
    return json({ ok: true, rule });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!env.KV) return json({ error: "KV 바인딩이 없다." }, 500);
  const p = new URL(request.url).searchParams;
  try {
    await deleteRule(env, {
      scope: p.get("scope") || "common",
      project: p.get("project"),
      id: p.get("id"),
    });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
