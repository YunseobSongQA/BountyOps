// 연결된 깃허브 구역(영역) 관리.
//   GET    /projects            → 연결된 구역 목록
//   POST   /projects {repo}     → owner/repo 를 깃허브에서 확인 후 연결
//   DELETE /projects?repo=      → 구역 연결 해제
//
// 깃허브 "프로젝트 선택해서 연결" 을 무거운 OAuth 없이 처리한다: owner/repo 를
// 받아 깃허브 공개 API 로 실존 여부를 확인하고(있으면 설명/기본 브랜치도 가져옴)
// KV 에 저장한다. 비공개 저장소는 env.GITHUB_TOKEN 이 있으면 함께 인증한다.

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

async function listProjects(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.KV.list({ prefix: "proj:", cursor });
    for (const k of page.keys) {
      const raw = await env.KV.get(k.name);
      if (raw) { try { out.push(JSON.parse(raw)); } catch (_) {} }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => (b.connectedAt || "").localeCompare(a.connectedAt || ""));
}

export async function onRequestGet({ env }) {
  if (!env.KV) return json({ error: "KV 바인딩이 없다." }, 500);
  return json({ projects: await listProjects(env) });
}

export async function onRequestPost({ request, env }) {
  if (!env.KV) return json({ error: "KV 바인딩이 없다." }, 500);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const repo = String(body.repo || "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");

  if (!REPO_RE.test(repo)) {
    return json({ error: "owner/repo 형태로 적어줘. 예) octocat/Hello-World" }, 400);
  }

  // 깃허브에서 구역이 실존하는지 확인.
  const headers = { "User-Agent": "BountyOps", Accept: "application/vnd.github+json" };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

  let meta = {};
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    if (res.status === 404) {
      return json({ error: "그런 구역은 깃허브에 없다(또는 비공개라 못 본다)." }, 404);
    }
    if (!res.ok) {
      return json({ error: `깃허브가 ${res.status} 로 퇴짜놨다.` }, 502);
    }
    const data = await res.json();
    meta = {
      description: data.description || "",
      defaultBranch: data.default_branch || "main",
      private: !!data.private,
      stars: data.stargazers_count || 0,
      url: data.html_url || `https://github.com/${repo}`,
    };
  } catch (e) {
    return json({ error: "깃허브에 닿지 못했다: " + e.message }, 502);
  }

  const project = {
    repo,
    branch: String(body.branch || meta.defaultBranch || "main"),
    ...meta,
    connectedAt: new Date().toISOString(),
  };
  await env.KV.put("proj:" + repo, JSON.stringify(project));
  return json({ ok: true, project });
}

export async function onRequestDelete({ request, env }) {
  if (!env.KV) return json({ error: "KV 바인딩이 없다." }, 500);
  const repo = new URL(request.url).searchParams.get("repo");
  if (!repo) return json({ error: "repo 가 필요하다." }, 400);
  await env.KV.delete("proj:" + repo);
  return json({ ok: true });
}
