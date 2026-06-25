# BountyOps — 보안관 사무소 🤠

노하우를 쌓고 조언해주는 **코드 현상금 사무소**. Claude Code 가 위험한 행동(예: `main` 직접 푸시,
`force push`, `.env` 손대기)을 하려 하면, 레데리(레드 데드 리뎀션) 감성으로 **총과 모자를 튀어나오게**
하며 "이 길로 가면 총 맞는다"고 일러준다.

PWA + Cloudflare Pages Functions(Workers 런타임) + KV.

## 구성

- **보안관 본부** — 푸시 알림 켜기, 시험 사격, 전과 기록부(쌓이는 노하우 장부).
- **내 구역** — 감시할 깃허브 저장소(`owner/repo`)를 연결. 구역마다 전용 훅 URL(`/hook?project=owner/repo`)을 발급.
- **수배령** — 잡을 행동의 단서(정규식)와 서부 감성 경고문을 적어 규칙을 발부. 공통/프로젝트별로 관리.
  기본 수배령 4종(main 푸시 · force push · 비밀 금고 · `rm -rf`)은 항상 작동.

## 동작

1. Claude Code 의 PreToolUse 훅이 구역별 훅 URL 로 이벤트 JSON 을 POST 한다.
2. `functions/hook.js` 가 프로젝트+공통+기본 수배령과 대조한다.
3. 걸리면 모든 구독자에게 총/모자와 함께 푸시를 쏘고, 전과 기록부에 한 줄 남긴다.

## 엔드포인트

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/subscribe` | 푸시 구독 저장 |
| POST | `/hook?project=owner/repo` | Claude Code 훅 수신 |
| GET | `/send?msg=...` | 모든 구독자에게 테스트 푸시 |
| GET/POST/DELETE | `/rules` | 수배령(규칙) 장부 CRUD |
| GET/POST/DELETE | `/projects` | 깃허브 구역 연결 관리 |
| GET | `/incidents` | 전과 기록부 조회 |

## 환경변수 / 바인딩

- `KV` — Workers KV 네임스페이스 바인딩
- `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` — Web Push VAPID
- `GITHUB_TOKEN` (선택) — 비공개 저장소 연결용

## 개발

```bash
npm run dev     # wrangler pages dev .
npm run deploy  # wrangler pages deploy .
```

> 한 발이면 충분하다.
