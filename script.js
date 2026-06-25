// BountyOps 보안관 사무소 — 클라이언트 로직.
// 알림 구독 + 깃허브 구역 연결 + 수배령(규칙) 장부 + 전과 기록부 + 총/모자 토스트.

// VAPID *공개* 키만 클라이언트에 둔다. 개인키는 절대 브라우저로 내보내지 않는다
// (서버 VAPID_PRIVATE 환경변수에만 존재).
const VAPID_PUBLIC = "BNE7CDysBzJ-1WKEtZSQe8MW9CS0sDN8YPWp-oiRzB6Hpbj8ypm4RTeF9juaN_XrWCZsuvwTkzPRw5NEoLG6sVE";

const ICONS = { gun: "🔫", hat: "🤠", star: "⭐", skull: "💀", dynamite: "🧨" };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let projects = [];          // 연결된 구역
let lastIncidentKey = null;  // 새 사건 감지용

// ── 알림 켜기 ──────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const setLog = (el, m) => { el.textContent = m; };

$("enable").addEventListener("click", async () => {
  const log = $("log");
  try {
    if (!("serviceWorker" in navigator)) return setLog(log, "이 브라우저는 알림을 못 받는다.");
    const reg = await navigator.serviceWorker.register("/sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setLog(log, "알림 권한이 거부됐어요. 보안관이 잠들었다.");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
    const res = await fetch("/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub),
    });
    setLog(log, res.ok ? "보안관이 깨어났다. 이제 총소리가 울린다. 🔔" : "구독 저장 실패");
  } catch (e) {
    setLog(log, "에러: " + e.message);
  }
});

// 시험 사격 — 토스트를 띄워보고(앱 내), 가능하면 실제 푸시도 한 발 쏜다.
$("testShot").addEventListener("click", async () => {
  showToast({ icon: "gun", name: "시험 사격", message: "탕! 총소리는 잘 울린다, 보안관." });
  try {
    await fetch("/send?msg=" + encodeURIComponent("🔫 시험 사격 — 보안관 사무소 정상 작동"));
  } catch (_) {}
});

// ── 토스트: 총이나 모자가 튀어나온다 ───────────────────────────────────
let toastTimer = null;
function showToast({ icon, name, message }) {
  const t = $("toast");
  t.innerHTML =
    `<div class="big">${ICONS[icon] || "🔫"}</div>` +
    `<div><div class="t-name">${esc(name)}</div><div class="t-msg">${esc(message)}</div></div>`;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 5200);
}

// ── 탭 전환 ────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
    btn.classList.add("is-active");
    $(btn.dataset.tab).classList.add("is-active");
  });
});

// ── 구역(깃허브 프로젝트) ──────────────────────────────────────────────
async function loadProjects() {
  try {
    const res = await fetch("/projects");
    const data = await res.json();
    projects = data.projects || [];
  } catch (_) { projects = []; }
  renderProjects();
  refreshScopeSelectors();
}

function hookUrl(repo) {
  return `${location.origin}/hook?project=${encodeURIComponent(repo)}`;
}

function renderProjects() {
  const box = $("projects");
  if (!projects.length) {
    box.innerHTML = '<div class="empty">연결된 구역이 없다. 첫 영역을 차지해보게.</div>';
    return;
  }
  box.innerHTML = projects.map((p) => `
    <div class="territory-card">
      <div class="top">
        <span class="repo">🤠 ${esc(p.repo)}</span>
        <span>
          ${p.private ? '<span class="chip">비공개</span>' : `<span class="chip">★ ${esc(p.stars || 0)}</span>`}
          <button class="btn-x" data-disconnect="${esc(p.repo)}">연결 해제</button>
        </span>
      </div>
      ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ""}
      <div class="desc small">기본 브랜치: <code>${esc(p.branch || "main")}</code></div>
      <div class="hookurl" data-copy="${esc(hookUrl(p.repo))}" title="눌러서 복사 — Claude Code 훅에 이 URL을 등록">
        🔗 ${esc(hookUrl(p.repo))}
      </div>
    </div>`).join("");

  box.querySelectorAll("[data-disconnect]").forEach((b) =>
    b.addEventListener("click", () => disconnectRepo(b.dataset.disconnect)));
  box.querySelectorAll("[data-copy]").forEach((el) =>
    el.addEventListener("click", () => copyText(el.dataset.copy, $("repoLog"))));
}

async function copyText(text, log) {
  try {
    await navigator.clipboard.writeText(text);
    if (log) setLog(log, "훅 URL 을 복사했다. Claude Code 훅에 붙여넣어라.");
  } catch (_) {
    if (log) setLog(log, "복사 실패 — 직접 긁어서 복사해라.");
  }
}

$("connectRepo").addEventListener("click", async () => {
  const log = $("repoLog");
  const repo = $("repoInput").value.trim();
  if (!repo) return setLog(log, "owner/repo 를 적어줘.");
  setLog(log, "깃허브에 구역을 확인하는 중…");
  try {
    const res = await fetch("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo }),
    });
    const data = await res.json();
    if (!res.ok) return setLog(log, "실패: " + (data.error || res.status));
    $("repoInput").value = "";
    setLog(log, `구역 확보! ${data.project.repo} 를 감시 구역에 넣었다.`);
    await loadProjects();
  } catch (e) {
    setLog(log, "에러: " + e.message);
  }
});

async function disconnectRepo(repo) {
  if (!confirm(`${repo} 구역의 연결을 해제할까? (수배령은 남는다)`)) return;
  await fetch("/projects?repo=" + encodeURIComponent(repo), { method: "DELETE" });
  await loadProjects();
}

// 구역 선택 드롭다운들(수배령 발부 / 보기)을 최신 구역 목록으로 갱신.
function refreshScopeSelectors() {
  const optHtml =
    '<option value="common">공통 — 모든 구역</option>' +
    projects.map((p) => `<option value="proj:${esc(p.repo)}">🤠 ${esc(p.repo)}</option>`).join("");
  const viewHtml =
    '<option value="common">공통</option>' +
    projects.map((p) => `<option value="proj:${esc(p.repo)}">${esc(p.repo)}</option>`).join("");

  const keep = (sel, html) => { const v = sel.value; sel.innerHTML = html; sel.value = v || "common"; if (!sel.value) sel.value = "common"; };
  keep($("ruleScope"), optHtml);
  keep($("viewScope"), viewHtml);
}

// ── 수배령(규칙) ───────────────────────────────────────────────────────
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
  if (!rule.pattern) return setLog(log, "수배 단서(패턴)를 적어줘. 빈 손으론 못 잡는다.");
  setLog(log, "수배 포스터를 붙이는 중…");
  try {
    const res = await fetch("/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rule),
    });
    const data = await res.json();
    if (!res.ok) return setLog(log, "실패: " + (data.error || res.status));
    setLog(log, `수배령 발부 완료 — "${data.rule.name}". 현상금 ${data.rule.bounty}.`);
    $("ruleName").value = ""; $("rulePattern").value = ""; $("ruleMessage").value = "";
    showToast({ icon: rule.icon, name: "새 수배령", message: rule.name + " — 포스터를 붙였다." });
    loadRules();
  } catch (e) {
    setLog(log, "에러: " + e.message);
  }
});

$("viewScope").addEventListener("change", loadRules);

async function loadRules() {
  const box = $("rulesList");
  const { project } = parseScope($("viewScope").value);
  const isCommonView = $("viewScope").value === "common";
  try {
    const url = "/rules" + (project ? "?project=" + encodeURIComponent(project) : "");
    const res = await fetch(url);
    const data = await res.json();
    const list = isCommonView
      ? [...(data.common || []), ...(data.defaults || [])]
      : (data.project || []);
    renderRules(box, list, isCommonView);
  } catch (e) {
    box.innerHTML = `<div class="empty">수배령을 못 불러왔다: ${esc(e.message)}</div>`;
  }
}

function renderRules(box, list, isCommonView) {
  if (!list.length) {
    box.innerHTML = isCommonView
      ? '<div class="empty">공통 수배령이 없다.</div>'
      : '<div class="empty">이 구역엔 전용 수배령이 없다. 위에서 하나 발부해보게.</div>';
    return;
  }
  box.innerHTML = list.map((r) => `
    <div class="poster ${r.isDefault ? "locked" : ""}">
      <div class="ptop">
        <span class="pico">${ICONS[r.icon] || "🔫"}</span>
        <span class="pname">${esc(r.name)}</span>
        <span class="sev ${esc(r.severity)}">${esc(r.severity)}</span>
      </div>
      <div class="pmsg">"${esc(r.message)}"</div>
      <div class="ppat">단서[${esc(r.target)}]: ${esc(r.pattern)}</div>
      <div class="pfoot">
        <span class="bounty">현상금 ${esc(r.bounty)}</span>
        ${r.isDefault
          ? '<span class="lockmark">🔒 기본 수배령(항상 작동)</span>'
          : `<button class="btn-x" data-del="${esc(r.id)}" data-scope="${esc(r.scope)}" data-proj="${esc(r.project || "")}">폐기</button>`}
      </div>
    </div>`).join("");

  box.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteRule(b.dataset.del, b.dataset.scope, b.dataset.proj)));
}

async function deleteRule(id, scope, project) {
  if (!confirm("이 수배령을 폐기할까?")) return;
  const q = new URLSearchParams({ id, scope: scope || "common" });
  if (project) q.set("project", project);
  await fetch("/rules?" + q.toString(), { method: "DELETE" });
  loadRules();
}

// ── 전과 기록부 + 새 사건 토스트 ───────────────────────────────────────
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
    const res = await fetch("/incidents?limit=50");
    const data = await res.json();
    const list = data.incidents || [];

    // 앱이 열려있는 동안 새 사건이 들어오면 총/모자를 튀어나오게.
    const newest = list[0];
    if (announce && newest) {
      const key = newest.at + newest.ruleId + (newest.snippet || "");
      if (lastIncidentKey && key !== lastIncidentKey) {
        showToast({ icon: newest.icon, name: newest.ruleName, message: newest.message });
      }
      lastIncidentKey = key;
    } else if (newest) {
      lastIncidentKey = newest.at + newest.ruleId + (newest.snippet || "");
    }

    if (!list.length) {
      box.innerHTML = '<div class="empty">아직 잡힌 무법자가 없다. 조용한 마을이군.</div>';
      return;
    }
    box.innerHTML = list.map((i) => `
      <div class="ledger-row">
        <span class="ico">${ICONS[i.icon] || "🔫"}</span>
        <div class="body">
          <div class="head">
            <span class="name">${esc(i.ruleName)}</span>
            <span class="sev ${esc(i.severity)}">${esc(i.severity)}</span>
            <span class="meta">· ${esc(i.bounty)} · ${esc(timeAgo(i.at))}${i.project ? " · @" + esc(i.project) : ""}</span>
          </div>
          <div class="msg">"${esc(i.message)}"</div>
          ${i.snippet ? `<div class="snip">[${esc(i.tool)}] ${esc(i.snippet)}</div>` : ""}
        </div>
      </div>`).join("");
  } catch (e) {
    box.innerHTML = `<div class="empty">장부를 못 펼쳤다: ${esc(e.message)}</div>`;
  }
}

// ── 시작 ───────────────────────────────────────────────────────────────
loadProjects().then(loadRules);
loadIncidents();
setInterval(() => loadIncidents({ announce: true }), 15000);
