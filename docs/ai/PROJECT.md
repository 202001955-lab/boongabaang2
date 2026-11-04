# 프로젝트 지도

파일을 찾기 위한 안내다. 현재 브랜치의 코드와 명령을 우선 확인하고, 구조가 바뀌면 함께 갱신한다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `app/page.tsx` | `/world/index.html`로 이동 |
| `app/api/config/route.ts` | 공개 Supabase 설정 전달 |
| `public/world/index.html` | Three.js 장면, DOM UI, 이동·가게·제보·체험 기능 |
| `public/world/live.js` | Supabase 인증·저장·Realtime, Leaflet 지도, 리뷰 |
| `public/world/ui.js`, `ui.css` | 연결·빈 동네·재시도 상태, 모바일 표시 |
| `supabase/schema.sql` | DB 초기 스키마; 운영 마이그레이션으로 실행하지 않음 |
| `tests/world.test.cjs` | 실제 프론트 스크립트의 Node 회귀 검사 |
| `tests/e2e/` | 실제 브라우저 사용자 흐름과 모의 HTTP/WebSocket |
| `.github/workflows/tests.yml` | 설치·Node 검사·프로덕션 빌드 포함 E2E·리포트 업로드 |

화면 로직은 React 컴포넌트보다 정적 HTML/JS에 집중되어 있다.
Next.js 빌드 성공만으로 `public/world`의 동작이 검증되지는 않는다.
전역 함수와 `live.js`의 함수 래핑 순서에 의존하므로 변경 시 실제 브라우저에서 확인한다.

## 실행과 검사

명령의 기준은 [package.json](../../package.json), 상세 절차는 [E2E 안내](../../tests/e2e/README.md)다.
기본 도구는 npm, CI Node 버전은 22다. `package-lock.json`을 함께 관리한다.

- 설치: `npm ci`
- 프론트 개발: `npm run dev`; `?mode=demo`는 서버 설정 없이 체험 기능을 확인한다.
- Node 회귀 검사: `npm test`
- 브라우저 설치: `npx playwright install chromium webkit`
- 전체 E2E: `npm run test:e2e`; 프로덕션 빌드·서버 시작도 포함한다.
- 두 테스트 묶음: `npm run test:all`
- 빌드만 확인: `npm run build`; 생성된 타입을 포함한 개별 확인은 `npx tsc --noEmit`.
- 현재 별도 lint 명령은 없다. 추가하는 작업이라면 설정·명령·CI·안내를 함께 갱신한다.

E2E는 3100 포트를 사용한다. 같은 워크트리에서 개발 서버·빌드·E2E를 동시에 돌리면 `.next`가 충돌한다.
별도 워크트리는 `.next`를 격리하지만 포트는 공유하므로, 같은 컴퓨터의 E2E는 실행 순서를 조율한다.
다른 AI의 서버를 강제로 종료하지 않는다.

## 유지해야 할 동작

- 예시 데이터와 실제 제보를 명확히 구분한다. 조회 실패를 “가게 없음”으로 보여 주지 않는다.
- 목격 저장 실패 시 성공 기록·쿨다운을 남기지 않는다. 중복 제출과 늦게 도착한 응답의 다른 동네 적용을 막는다.
- 사용자의 GPS에서 계산한 좌표를 공유 아바타 위치로 사용하지 않는다. 등록자가 확인한 공개 가게 위치와 구별한다.
- E2E에서는 실제 SDK와 WebGL을 실행하고 네트워크만 대체한다. 앱 함수를 바꿔 성공 결과를 만들어내지 않는다.

## 알려진 제약 — 변경 시 재확인

- `schema.sql`에는 테이블 삭제 구문이 있고, 프론트가 사용하는 가게 `lat/lng` 컬럼이 없다.
  원격 DB의 현재 상태는 이 파일만으로 알 수 없다. 파일을 운영 DB에 그대로 실행하거나 실제 연동 성공을 추정하지 않는다.
- 사진 기능은 온라인에서 꺼져 있다. 사진·신고·관리 정책을 다루는 별도 작업 없이 켜지 않는다.
- 실제 DB/RLS·제보 제한 트리거·지도 서비스 정책·배포 권한은 모의 E2E 범위 밖이다.
- CDN 버전과 E2E의 로컬 SDK 버전이 일치해야 한다. 의존성 업그레이드는 코드·fixture·잠금 파일·검증을 함께 다룬다.
- 현재 권한/PR/CI 상태는 작업 기록의 시점별 관찰이다. 다음 작업에서 다시 확인한다.
