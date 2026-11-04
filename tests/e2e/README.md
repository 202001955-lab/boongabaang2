# 프론트엔드 E2E 테스트

## 실행

Node.js 22 환경을 기준으로 합니다. 최초 한 번:

```sh
npm ci
npx playwright install chromium webkit
```

Linux/CI에서는 브라우저 시스템 패키지도 설치합니다:

```sh
npx playwright install --with-deps chromium webkit
```

```sh
npm test                 # 기존 Node 회귀 테스트
npm run test:e2e         # 전체 브라우저 테스트
npm run test:all         # 두 테스트 묶음 모두
npm run test:e2e:ui      # 대화형 실행 및 디버깅
npm run test:e2e:report  # 마지막 HTML 리포트
```

한 브라우저나 특정 시나리오만 실행할 수도 있습니다:

```sh
npm run test:e2e -- --project=desktop-chromium
npm run test:e2e -- tests/e2e/reviews.spec.js
npm run test:e2e -- --grep 'failed report'
```

`playwright.config.js`가 프로덕션 빌드를 만든 뒤 `127.0.0.1:3100`에서 서버를 시작하고
종료합니다. 3100 포트는 비워 두세요. 기존 개발 서버를 재사용하지 않습니다.
테스트 실행 중 같은 폴더에서 `next dev`/`next build`를 함께 실행하면 `.next`가 충돌하므로
별도의 checkout을 사용하거나 개발 서버를 잠시 종료하세요.

## 검증 범위

35개 시나리오를 데스크톱 Chromium, Pixel 7 크기의 모바일 Chromium,
iPhone 13 크기의 모바일 WebKit에서 실행합니다. 총 105개 브라우저 테스트입니다. 모바일 기기 자체를 검증하는 것은 아닙니다.

| 파일 | 사용자 흐름 |
| --- | --- |
| `onboarding.spec.js` | 데모 진입, 설정·통신·인증 실패 대체 화면, 닉네임·동네 입력 검증, 위치 권한 거부, GPS 진입 시 아바타 좌표, 튜토리얼, 닉네임·소리 설정, 최근 동네 |
| `shops.spec.js` | 빈 동네, 로딩 중 진입 제한, 목록·목격 조회 실패와 재시도, 상세 정보, 봤어요·없어요, 저장 실패, 중복 클릭·쿨다운, 저장 중 동네 변경 |
| `maps-and-registration.spec.js` | 데모 로컬 저장·재방문, 실제 지도 핀 등록, 등록 실패 복구, 검색·취소, 지도 다운로드 실패, 길찾기 링크, 월드 지도 이동, 화면 밖으로 벗어나는 주요 조작 요소 |
| `reviews.spec.js` | 작성·수정, 실패 후 초안 유지·재시도, 페이지 이동, HTML 문자열의 텍스트 표시 |
| `realtime.spec.js` | 새 가게·목격·리뷰 수신, 연결 오류·재연결, 줄 참여 전후 채팅, 메시지 송수신 |

각 테스트에서 처리되지 않은 브라우저 예외와 모의 처리되지 않은 외부 요청이 있으면 실패합니다.
UI는 실제 클릭·입력으로 조작합니다. 앱 전역 변수나 함수로 성공 상태를 만들어내지 않습니다.

## 네트워크 경계

- Three.js `0.128.0`, Supabase SDK `2.45.4`, Leaflet `1.9.4`는 앱 CDN 버전과 같은
  npm 개발 의존성을 사용합니다. 테스트는 CDN 요청을 로컬 파일로 대체합니다.
- `/api/config`, 익명 인증, PostgREST, Supabase Realtime의 WebSocket 메시지를
  `support/fixtures.js`에서 테스트마다 독립적으로 모의 처리합니다.
- 지도 타일과 장소 검색도 모의 처리합니다. 실제 GPS 대신 브라우저 위치 에뮬레이션을 사용합니다.
- 실제 계정·API 키·서버 데이터가 필요 없으며, 실제 Supabase에 쓰기 요청을 보내지 않습니다.
- 대기·실패·재시도는 `backend.hold()`, `fail()`, `recover()`로 제어합니다.
  네트워크에 맞춘 고정 sleep 대신 화면 상태와 실제 요청을 기다립니다.
- SDK 교체 시 앱의 CDN URL과 테스트 의존성·프로토콜 fixture를 함께 갱신해야 합니다.
  현재 SDK 버전은 기존 앱과의 일치를 위해 유지했으며 의존성 보안 업데이트는 별도 작업입니다.

## 테스트 추가 방법

`./support/fixtures`의 `test`, `expect`를 import하고 `app.enter()`로 화면에 진입합니다.
데이터는 진입 전에 `backend.shops`, `sightings`, `reviews`로 설정할 수 있습니다.
서버 실패는 `backend.fail('POST sightings')`처럼 HTTP 메서드와 테이블 이름으로 지정합니다.
보류한 요청은 `try/finally`에서 반드시 해제하세요. 테스트 간 저장소·서버 상태는 공유되지 않습니다.

## 결과와 한계

실패 시 HTML 리포트에 screenshot, video, trace가 남습니다. 출력 디렉터리는 Git에서 제외합니다.
GitHub Actions는 PR과 주요 브랜치 push 시 테스트를 실행하고 결과를 7일간 보관합니다.
로컬에서는 자동 재시도하지 않고 CI에서만 실패한 테스트를 한 번 재시도합니다.

이 테스트는 **브라우저에서의 프론트 동작과 요청/응답 계약**을 확인합니다.
실제 DB 스키마, RLS, 제보 제한 트리거, 실제 서버의 Realtime 권한·성능,
지도 제공자의 데이터·사용 제한은 검증하지 않습니다. 백엔드 권한 확보 후 별도 통합 테스트가 필요합니다.
사진 업로드는 온라인 기능이 꺼져 있어 실제 Storage 업로드를 검증하지 않습니다.
WebGL은 실제 실행하지만 GPU별 픽셀 일치·프레임 성능을 보장하는 시각 회귀 테스트는 아닙니다.
