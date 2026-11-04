# 붕세권 (BungZone)

고양이가 되어 동네를 걸어 다니며 붕어빵 노점을 찾는 실시간 월드. Next.js + Supabase.

- 월드 화면: `public/world/index.html` (3D, 서버 연결 코드는 `public/world/live.js`)
- 서버 설정 전달: `app/api/config/route.ts`
- DB: `supabase/schema.sql`

서버 설정이 없으면 월드는 "혼자 하기(데모)" 모드로 열립니다.

## 요청과 피드백 남기기

개발 지식 없이도 문제를 제보하고 개선을 요청할 수 있습니다.
[협업 안내와 작성 예시](CONTRIBUTING.md)를 먼저 확인해 주세요.

## AI와 개발하기

새 AI는 [AGENTS.md](AGENTS.md)를 읽고 시작합니다. 브랜치·워크트리·커밋·푸시 규칙,
프로젝트 스킬과 작업 인수인계는 [AI 협업 안내](docs/ai/README.md)에서 찾을 수 있습니다.
코드나 운영 방식이 바뀌면 관련 지침과 작업 기록도 같은 PR에서 갱신합니다.

## 실행 순서
1. supabase.com 에서 프로젝트 만들기
2. Authentication → Sign In / Providers → **Anonymous sign-ins 켜기**
3. SQL Editor 에 `supabase/schema.sql` 전체를 붙여넣고 Run (한 번만)
4. `.env.local.example` 을 `.env.local` 로 복사해서 URL, publishable key 채우기
5. `npm install` → `npm run dev` → http://localhost:3000
6. 배포: Vercel 에 올리고 같은 두 값을 Environment Variables 에 넣기

## 개인정보
진짜 GPS 좌표는 서버로 보내지 않아요. 공유되는 건 동네 이름과 월드 좌표뿐입니다.

## 프론트엔드만 개발하기

백엔드 설정 없이 `npm install` → `npm run dev`로 실행할 수 있습니다.
`http://localhost:3000/world/index.html?mode=demo`는 서버 설정을 요청하지 않고
체험 모드로 시작합니다. 예시 가게와 대화를 표시하며, 체험 제보는 이 기기에만 저장합니다.
실제 서비스 데이터와 체험 데이터는 화면 안내로 구분합니다.

- `public/world/ui.js`, `ui.css`: 연결 상태, 빈 동네, 재시도 안내
- `npm test`: 실제 프론트 스크립트를 실행하는 회귀 테스트 (DOM·네트워크·3D 렌더링은 대체)
- `npm run build`: Next.js 빌드 및 타입 검사

실제 Supabase 저장·실시간 동기화와 WebGL 화면은 별도 브라우저 확인이 필요합니다.

## E2E 테스트

백엔드 권한 없이 실제 브라우저에서 주요 흐름을 검증할 수 있습니다.

```sh
npm ci
npx playwright install chromium webkit
npm run test:e2e
```

데스크톱 Chrome, 모바일 Chrome, 모바일 Safari(WebKit) 환경에서 실행합니다.
서버 API·실시간 메시지·지도 데이터는 모의 처리하며 실제 외부 서비스에 데이터를 쓰지 않습니다.
테스트가 3100 포트에서 프로덕션 서버를 자동으로 실행합니다.
실행 옵션, 검증 범위와 한계는 [E2E 안내](tests/e2e/README.md)를 참고하세요.
