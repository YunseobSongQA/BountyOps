// 현상수배 엔진 (shared rules engine).
//
// BountyOps 는 "노하우를 쌓고 조언해주는" 보안관 사무소다. 규칙(=현상수배령)을
// 공통(common)과 프로젝트별(project)로 KV 에 저장해두고, Claude Code 훅이 들어오면
// 들어온 행동을 수배령과 대조해서 "이 길로 가면 총 맞는다"라고 일러준다.
//
// KV 키 구조
//   rule:common:<id>                공통 수배령
//   rule:proj:<owner/repo>:<id>     프로젝트 전용 수배령
//   proj:<owner/repo>               연결된 깃허브 구역(영역)
//   incident:<역순타임스탬프>:<rand> 전과 기록(최근 것이 먼저 나오도록 역순 키)

// 알림에 등장하는 서부 아이콘들. 총이나 모자가 튀어나오게.
export const ICONS = {
  gun: "🔫",
  hat: "🤠",
  star: "⭐",
  skull: "💀",
  dynamite: "🧨",
};

// 기본으로 항상 깔려있는 수배령. 사용자가 따로 안 짜도 기본 보안관이 지켜본다.
// isDefault 표시가 붙어 프론트에서 "기본 수배령(읽기 전용)"으로 보인다.
export const DEFAULT_RULES = [
  {
    id: "def-push-main",
    scope: "common",
    project: null,
    name: "보안관 허락 없이 main 입성",
    target: "command",
    pattern: "git\\s+push.*\\bmain\\b",
    severity: "현상수배",
    bounty: "$500",
    icon: "gun",
    message: "보안관 허락도 없이 main 으로 쳐들어가는구만. 총 맞기 딱 좋은 길이여. PR 통하지 그래.",
    isDefault: true,
  },
  {
    id: "def-force",
    scope: "common",
    project: null,
    name: "force push — 마을 폭파범",
    target: "command",
    pattern: "push.*(--force|-f\\b|--force-with-lease)",
    severity: "현상수배",
    bounty: "$750",
    icon: "dynamite",
    message: "force push 라니, 마을을 통째로 날려버릴 셈인가. 동료들 히스토리가 잿더미 된다.",
    isDefault: true,
  },
  {
    id: "def-secret",
    scope: "common",
    project: null,
    name: "비밀 금고에 손대기",
    target: "file",
    pattern: "(\\.env|secret|credentials?|결제|payment|\\.pem|id_rsa)",
    severity: "수배",
    bounty: "$300",
    icon: "skull",
    message: "비밀 금고(.env / 시크릿)를 건드렸어. 이건 들키면 교수형감이여. 정말 커밋할 셈인가?",
    isDefault: true,
  },
  {
    id: "def-rm-rf",
    scope: "common",
    project: null,
    name: "rm -rf, 다이너마이트 한 다발",
    target: "command",
    pattern: "rm\\s+-rf?\\s+([~/]|\\*|\\.)",
    severity: "현상수배",
    bounty: "$900",
    icon: "dynamite",
    message: "rm -rf 라… 발밑에 다이너마이트 깔아놨네. 한 발 잘못 디디면 마을이 사라진다.",
    isDefault: true,
  },
];

// --- KV 헬퍼 ---------------------------------------------------------------

async function getJSON(env, key) {
  const raw = await env.KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function ruleKey(scope, project, id) {
  return scope === "project"
    ? `rule:proj:${project}:${id}`
    : `rule:common:${id}`;
}

function rulePrefix(scope, project) {
  return scope === "project"
    ? `rule:proj:${project}:`
    : `rule:common:`;
}

async function listByPrefix(env, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await env.KV.list({ prefix, cursor });
    for (const k of page.keys) {
      const v = await getJSON(env, k.name);
      if (v) out.push(v);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

// --- 규칙 CRUD -------------------------------------------------------------

// 한 사람이 등록한 모든 사용자 수배령(공통 + 특정 프로젝트). 기본 수배령은 제외.
export async function listUserRules(env, project) {
  const common = await listByPrefix(env, rulePrefix("common"));
  const proj = project
    ? await listByPrefix(env, rulePrefix("project", project))
    : [];
  return { common, project: proj };
}

// 훅이 평가에 쓰는 전체 수배령: 기본 + 공통(사용자) + 해당 프로젝트.
export async function loadRules(env, project) {
  const { common, project: proj } = await listUserRules(env, project);
  // 프로젝트 전용이 가장 우선, 그다음 공통, 마지막이 기본.
  return [...proj, ...common, ...DEFAULT_RULES];
}

const SEVERITIES = ["주의", "수배", "현상수배"];

export async function saveRule(env, input) {
  const scope = input.scope === "project" ? "project" : "common";
  const project = scope === "project" ? String(input.project || "").trim() : null;
  if (scope === "project" && !project) {
    throw new Error("프로젝트 전용 수배령에는 구역(owner/repo)이 필요하다.");
  }
  const id = input.id && String(input.id) || crypto.randomUUID();
  const rule = {
    id,
    scope,
    project,
    name: String(input.name || "이름 없는 무법자").slice(0, 80),
    target: ["command", "file", "any"].includes(input.target) ? input.target : "any",
    pattern: String(input.pattern || "").slice(0, 300),
    severity: SEVERITIES.includes(input.severity) ? input.severity : "수배",
    bounty: String(input.bounty || "$100").slice(0, 20),
    icon: ICONS[input.icon] ? input.icon : "gun",
    message: String(input.message || "이 길은 위험하다, 친구.").slice(0, 400),
    createdAt: input.createdAt || new Date().toISOString(),
  };
  if (!rule.pattern) throw new Error("수배 단서(패턴)가 비어있다.");
  // 패턴이 정규식으로 유효한지 미리 검증.
  try { new RegExp(rule.pattern, "i"); } catch (e) {
    throw new Error("수배 단서(정규식)가 엉터리다: " + e.message);
  }
  await env.KV.put(ruleKey(scope, project, id), JSON.stringify(rule));
  return rule;
}

export async function deleteRule(env, { scope, project, id }) {
  if (!id) throw new Error("어느 수배령인지 id 가 필요하다.");
  await env.KV.delete(ruleKey(scope === "project" ? "project" : "common", project, id));
}

// --- 평가 ------------------------------------------------------------------

function targetText(event, target) {
  const cmd = (event.tool_input && event.tool_input.command) || "";
  const file =
    (event.tool_input && (event.tool_input.file_path || event.tool_input.path)) || "";
  if (target === "command") return cmd;
  if (target === "file") return file;
  return [cmd, file, JSON.stringify(event.tool_input || {})].join(" ");
}

function matches(rule, event) {
  const text = targetText(event, rule.target);
  if (!text) return false;
  try {
    return new RegExp(rule.pattern, "i").test(text);
  } catch (_) {
    return text.toLowerCase().includes(rule.pattern.toLowerCase());
  }
}

// 들어온 이벤트를 수배령 목록과 대조. 가장 먼저 걸리는 놈을 잡는다(목록 순서가
// 곧 우선순위: 프로젝트 > 공통 > 기본).
export function evaluateEvent(event, rules) {
  for (const rule of rules) {
    if (matches(rule, event)) return rule;
  }
  return null;
}

// --- 전과 기록(노하우 장부) ------------------------------------------------

function incidentKey() {
  // 역순 타임스탬프 → 사전순 정렬하면 최신이 맨 위로 온다.
  const rev = (1e15 - Date.now()).toString().padStart(16, "0");
  const rand = Math.random().toString(36).slice(2, 8);
  return `incident:${rev}:${rand}`;
}

export async function logIncident(env, { project, tool, rule, snippet }) {
  const record = {
    at: new Date().toISOString(),
    project: project || null,
    tool: tool || "?",
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    icon: rule.icon,
    bounty: rule.bounty,
    message: rule.message,
    snippet: String(snippet || "").slice(0, 200),
  };
  // 장부는 30일 보관.
  await env.KV.put(incidentKey(), JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 30,
  });
  return record;
}

export async function listIncidents(env, limit = 50) {
  const out = [];
  const page = await env.KV.list({ prefix: "incident:", limit });
  for (const k of page.keys) {
    const v = await getJSON(env, k.name);
    if (v) out.push(v);
  }
  return out;
}
