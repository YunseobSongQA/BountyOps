// BountyOps — 클라이언트 로직.
// 알림 구독 + 깃허브 저장소 연결 + 규칙 장부 + 최근 기록 + 알림 토스트.

// VAPID *공개* 키만 클라이언트에 둔다. 개인키는 서버 환경변수(VAPID_PRIVATE)에만.
const VAPID_PUBLIC = "BNE7CDysBzJ-1WKEtZSQe8MW9CS0sDN8YPWp-oiRzB6Hpbj8ypm4RTeF9juaN_XrWCZsuvwTkzPRw5NEoLG6sVE";

// 표식 이모지는 알림이 울리는 순간(토스트/기록)에만 쓴다 — 나머지 UI는 깔끔하게.
const ICONS = { gun: "🔫", hat: "🤠", star: "⭐", skull: "💀", dynamite: "🧨" };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const setLog = (el, m) => { el.textContent = m; };

let projects = [];
let lastIncidentKey = null;

// ── 탭 / 시작하기 단계 이동 ────────────────────────────────────────────
function goTab(id) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === id));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("is-active", p.id === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => goTab(b.dataset.tab)));
document.querySelectorAll(".step").forEach((b) => b.addEventListener("click", () => goTab(b.dataset.go)));

// ── 알림 켜기 ──────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

$("enable").addEventListener("click", async () => {
  const log = $("log");
  try {
    if (!("serviceWorker" in navigator)) return setLog(log, "이 브라우저는 푸시 알림을 지원하지 않아요.");
    const reg = await navigator.serviceWorker.register("/sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setLog(log, "알림 권한이 거부됐어요. 브라우저 설정에서 허용해 주세요.");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
    const res = await fetch("/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub),
    });
    setLog(log, res.ok ? "이 기기에 알림을 켰어요. 규칙에 걸리면 알려줄게요." : "구독 저장에 실패했어요.");
  } catch (e) {
    setLog(log, "에러: " + e.message);
  }
});

$("testShot").addEventListener("click", async () => {
  showToast({ icon: "gun", name: "시험 알림", message: "잘 울립니다. 준비 끝." });
  try { await fetch("/send?msg=" + encodeURIComponent("BountyOps 시험 알림 — 정상 작동")); } catch (_) {}
});

// ── 토스트: 총/모자가 한 번 튀어나온다 ─────────────────────────────────
let toastTimer = null;
function showToast({ icon, name, message }) {
  const t = $("toast");
  t.innerHTML =
    `<div class="big">${ICONS[icon] || "🔫"}</div>` +
    `<div><div class="nm">${esc(name)}</div><div class="ms">${esc(message)}</div></div>`;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 5000);
}

// ── 저장소(깃허브) ─────────────────────────────────────────────────────
async function loadProjects() {
  try {
    const res = await fetch("/projects");
    projects = (await res.json()).projects || [];
  } catch (_) { projects = []; }
  renderProjects();
  refreshScopeSelectors();
}

const hookUrl = (repo) => `${location.origin}/hook?project=${encodeURIComponent(repo)}`;

function renderProjects() {
  const box = $("projects");
  if (!projects.length) { box.innerHTML = '<div class="empty">연결된 저장소가 없다.</div>'; return; }
  box.innerHTML = projects.map((p) => `
    <div class="repo-item">
      <div class="top">
        <span class="name">${esc(p.repo)}</span>
        <span>
          <span class="chip">${p.private ? "비공개" : "★ " + esc(p.stars || 0)}</span>
          <button class="btn-del" data-disconnect="${esc(p.repo)}">연결 해제</button>
        </span>
      </div>
      ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ""}
      <div class="hook" data-copy="${esc(hookUrl(p.repo))}" title="눌러서 복사 — Claude Code 훅에 등록할 URL">
        ${esc(hookUrl(p.repo))}
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-disconnect]").forEach((b) =>
    b.addEventListener("click", () => disconnectRepo(b.dataset.disconnect)));
  box.querySelectorAll("[data-copy]").forEach((el) =>
    el.addEventListener("click", () => copyText(el.dataset.copy, $("repoLog"))));
}

async function copyText(text, log) {
  try { await navigator.clipboard.writeText(text); if (log) setLog(log, "훅 URL을 복사했어요. Claude Code 훅에 붙여넣으세요."); }
  catch (_) { if (log) setLog(log, "복사에 실패했어요. 직접 선택해 복사하세요."); }
}

$("connectRepo").addEventListener("click", async () => {
  const log = $("repoLog");
  const repo = $("repoInput").value.trim();
  if (!repo) return setLog(log, "owner/repo 형태로 적어 주세요.");
  setLog(log, "깃허브에서 저장소를 확인하는 중…");
  try {
    const res = await fetch("/projects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo }),
    });
    const data = await res.json();
    if (!res.ok) return setLog(log, "실패: " + (data.error || res.status));
    $("repoInput").value = "";
    setLog(log, `연결 완료 — ${data.project.repo}`);
    await loadProjects();
  } catch (e) { setLog(log, "에러: " + e.message); }
});

async function disconnectRepo(repo) {
  if (!confirm(`${repo} 연결을 해제할까요? (규칙은 남습니다)`)) return;
  await fetch("/projects?repo=" + encodeURIComponent(repo), { method: "DELETE" });
  await loadProjects();
}

function refreshScopeSelectors() {
  const ruleHtml = '<option value="common">공통 — 모든 저장소</option>' +
    projects.map((p) => `<option value="proj:${esc(p.repo)}">${esc(p.repo)}</option>`).join("");
  const viewHtml = '<option value="common">공통</option>' +
    projects.map((p) => `<option value="proj:${esc(p.repo)}">${esc(p.repo)}</option>`).join("");
  const keep = (sel, html) => { const v = sel.value; sel.innerHTML = html; sel.value = v; if (!sel.value) sel.value = "common"; };
  keep($("ruleScope"), ruleHtml);
  keep($("viewScope"), viewHtml);
}

// ── 규칙 ───────────────────────────────────────────────────────────────
function parseScope(val) {
  if (val && val.startsWith("proj:")) return { scope: "project", project: val.slice(5) };
  return { scope: "common", project: null };
}

$("saveRule").addEventListener("click", async () => {
  const log = $("ruleLog");
  const { scope, project } = parseScope($("ruleScope").value);
  const rule = {
    scope, project,
    name: $("ruleName").value.trim(),
    target: $("ruleTarget").value,
    severity: $("ruleSeverity").value,
    bounty: $("ruleBounty").value.trim(),
    icon: $("ruleIcon").value,
    pattern: $("rulePattern").value.trim(),
    message: $("ruleMessage").value.trim(),
  };
  if (!rule.pattern) return setLog(log, "단서(정규식)를 적어 주세요.");
  setLog(log, "규칙을 추가하는 중…");
  try {
    const res = await fetch("/rules", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(rule),
    });
    const data = await res.json();
    if (!res.ok) return setLog(log, "실패: " + (data.error || res.status));
    setLog(log, `규칙 추가됨 — "${data.rule.name}"`);
    $("ruleName").value = ""; $("rulePattern").value = ""; $("ruleMessage").value = "";
    loadRules();
  } catch (e) { setLog(log, "에러: " + e.message); }
});

$("viewScope").addEventListener("change", loadRules);

async function loadRules() {
  const box = $("rulesList");
  const { project } = parseScope($("viewScope").value);
  const isCommon = $("viewScope").value === "common";
  try {
    const res = await fetch("/rules" + (project ? "?project=" + encodeURIComponent(project) : ""));
    const data = await res.json();
    const list = isCommon ? [...(data.common || []), ...(data.defaults || [])] : (data.project || []);
    renderRules(box, list, isCommon);
  } catch (e) { box.innerHTML = `<div class="empty">규칙을 불러오지 못했어요: ${esc(e.message)}</div>`; }
}

function renderRules(box, list, isCommon) {
  if (!list.length) {
    box.innerHTML = `<div class="empty">${isCommon ? "공통 규칙이 없어요." : "이 저장소 전용 규칙이 없어요. 위에서 추가해 보세요."}</div>`;
    return;
  }
  box.innerHTML = list.map((r) => `
    <div class="rule ${r.isDefault ? "locked" : ""}">
      <div class="top">
        <span class="name">${esc(r.name)}</span>
        <span class="sev ${esc(r.severity)}">${esc(r.severity)}</span>
      </div>
      ${r.message ? `<div class="msg">“${esc(r.message)}”</div>` : ""}
      <div class="pat">${esc(r.target)} · ${esc(r.pattern)}</div>
      <div class="foot">
        <span class="bounty">${esc(r.bounty)}</span>
        ${r.isDefault
          ? '<span class="lock">기본 규칙 · 항상 작동</span>'
          : `<button class="btn-del" data-del="${esc(r.id)}" data-scope="${esc(r.scope)}" data-proj="${esc(r.project || "")}">삭제</button>`}
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteRule(b.dataset.del, b.dataset.scope, b.dataset.proj)));
}

async function deleteRule(id, scope, project) {
  if (!confirm("이 규칙을 삭제할까요?")) return;
  const q = new URLSearchParams({ id, scope: scope || "common" });
  if (project) q.set("project", project);
  await fetch("/rules?" + q.toString(), { method: "DELETE" });
  loadRules();
}

// ── 최근에 걸린 일(기록) + 새 사건 토스트 ──────────────────────────────
function timeAgo(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "방금";
  if (d < 3600) return Math.floor(d / 60) + "분 전";
  if (d < 86400) return Math.floor(d / 3600) + "시간 전";
  return Math.floor(d / 86400) + "일 전";
}

async function loadIncidents({ announce } = {}) {
  const box = $("incidents");
  try {
    const list = (await (await fetch("/incidents?limit=50")).json()).incidents || [];
    const newest = list[0];
    if (newest) {
      const key = newest.at + newest.ruleId + (newest.snippet || "");
      if (announce && lastIncidentKey && key !== lastIncidentKey) {
        showToast({ icon: newest.icon, name: newest.ruleName, message: newest.message });
      }
      lastIncidentKey = key;
    }
    if (!list.length) { box.innerHTML = '<div class="empty">아직 걸린 게 없다. 조용한 마을이군.</div>'; return; }
    box.innerHTML = list.map((i) => `
      <div class="inc">
        <span class="ic">${ICONS[i.icon] || "🔫"}</span>
        <div class="b">
          <div class="h">
            <span class="nm">${esc(i.ruleName)}</span>
            <span class="sev ${esc(i.severity)}">${esc(i.severity)}</span>
            <span class="meta">${esc(timeAgo(i.at))}${i.project ? " · " + esc(i.project) : ""}</span>
          </div>
          ${i.message ? `<div class="ms">“${esc(i.message)}”</div>` : ""}
          ${i.snippet ? `<div class="snip">${esc(i.tool)} · ${esc(i.snippet)}</div>` : ""}
        </div>
      </div>`).join("");
  } catch (e) { box.innerHTML = `<div class="empty">기록을 불러오지 못했어요: ${esc(e.message)}</div>`; }
}

// ── 시작 ───────────────────────────────────────────────────────────────
loadProjects().then(loadRules);
loadIncidents();
setInterval(() => loadIncidents({ announce: true }), 15000);
