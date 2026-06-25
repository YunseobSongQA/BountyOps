// Claude Code 의 PreToolUse 훅이 이 엔드포인트로 이벤트 JSON 을 POST 한다.
// 구역(프로젝트)별 훅 URL 은 ?project=owner/repo 를 달고 등록되므로, 그 구역의
// 전용 수배령 + 공통 수배령 + 기본 수배령을 모두 불러와 행동과 대조한다.
// 수배령에 걸리면 모든 보안관(구독자)에게 총/모자와 함께 경고를 쏘고, 전과 기록부에
// 한 줄 남긴다. 항상 즉시 200 "ok" 를 돌려준다(Claude 를 멈추지 않기 위해, 쏘고 잊기).
import { sendToAll } from "./_push.js";
import { loadRules, evaluateEvent, logIncident, ICONS } from "./_rules.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const project = new URL(request.url).searchParams.get("project") || null;

  let e = {};
  try { e = await request.json(); } catch (_) {}

  const tool = e.tool_name || "?";
  const cmd = (e.tool_input && e.tool_input.command) || "";
  const file = (e.tool_input && (e.tool_input.file_path || e.tool_input.path)) || "";

  let hit = null;
  try {
    const rules = await loadRules(env, project);
    hit = evaluateEvent(e, rules);
  } catch (_) {
    // 규칙 로딩이 깨져도 Claude 를 막지 않는다.
  }

  // 수배령에 걸릴 때만 총을 뽑는다(평소엔 조용히).
  if (hit) {
    const icon = ICONS[hit.icon] || "🔫";
    const snippet = (cmd || file || "").slice(0, 200);
    const where = project ? ` @${project}` : "";
    const title = `${icon} ${hit.severity}${where} · 현상금 ${hit.bounty}`;
    const body = `${hit.message}\n\n[${tool}] ${snippet}`;
    const payload = JSON.stringify({
      title,
      body,
      tag: "bounty-" + hit.id,
      icon: hit.icon,
      severity: hit.severity,
    });

    // 쏘고 잊기: 200 을 돌려주기 전에 await 하지 않는다.
    const work = Promise.allSettled([
      sendToAll(payload, env),
      logIncident(env, { project, tool, rule: hit, snippet }),
    ]).catch(() => {});
    if (context.waitUntil) context.waitUntil(work);
  }

  return new Response("ok");
}
