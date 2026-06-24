// Claude Code's PreToolUse hook POSTs event JSON here. We match the tool call
// against a few risk rules and, when something looks dangerous, push a warning
// to every subscriber. Always returns 200 "ok" immediately (fire-and-forget) so
// Claude is never blocked waiting on us.
import { sendToAll } from "./_push.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  let e = {};
  try { e = await request.json(); } catch (_) {}

  const tool = e.tool_name || "?";
  const cmd  = (e.tool_input && e.tool_input.command) || "";
  const file = (e.tool_input && e.tool_input.file_path) || "";

  let flag = "", note = "";
  if (/git\s+push/.test(cmd) && /\bmain\b/.test(cmd)) { flag = "⚠️"; note = "main 직접 푸시"; }
  else if (/--force/.test(cmd) && /push/.test(cmd))   { flag = "⚠️"; note = "force push"; }
  else if (/payment|결제|\.env|secret/.test(file))     { flag = "⚠️"; note = "민감 파일 수정"; }

  // 위험할 때만 푸시 (정상은 조용히)
  if (flag) {
    const text = flag + " " + note + "\n" + (cmd || file).slice(0, 200);
    const payload = JSON.stringify({ title: "BountyOps " + tool, body: text });
    // Fire-and-forget: never await before returning "ok".
    const p = sendToAll(payload, env).catch(() => {});
    if (context.waitUntil) context.waitUntil(p);
  }

  return new Response("ok");
}
