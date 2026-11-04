# 붕세권 (BungZone)

고양이가 되어 동네를 걸어 다니며 붕어빵 노점을 찾는 실시간 월드. Next.js + Supabase.

- 월드 화면: `public/world/index.html` (3D, 서버 연결 코드는 `public/world/live.js`)
- 서버 설정 전달: `app/api/config/route.ts`
- DB: `supabase/schema.sql`

서버 설정이 없으면 월드는 "혼자 하기(데모)" 모드로 열립니다.

## 실행 순서
1. supabase.com 에서 프로젝트 만들기
2. Authentication → Sign In / Providers → **Anonymous sign-ins 켜기**
3. SQL Editor 에 `supabase/schema.sql` 전체를 붙여넣고 Run (한 번만)
4. `.env.local.example` 을 `.env.local` 로 복사해서 URL, publishable key 채우기
5. `npm install` → `npm run dev` → http://localhost:3000
6. 배포: Vercel 에 올리고 같은 두 값을 Environment Variables 에 넣기

## 개인정보
진짜 GPS 좌표는 서버로 보내지 않아요. 공유되는 건 동네 이름과 월드 좌표뿐입니다.

## 캐릭터 GLB 시안

- 비교 페이지: `/world/character-comparison.html` — 같은 조명·카메라에서 기존 모델과 GLB를 정면/측면/뒷면으로 비교합니다.
- 월드에서 시안 보기: `/world/index.html?character=cozy` (기본 캐릭터와 다른 플레이어는 기존 모델 유지)
- 원본 모델: `public/world/models/cozy-cat.glb`, 외부 이미지·모델을 사용하지 않은 프로젝트 전용 시안입니다.
- 재생성: `python3 scripts/build-cozy-cat.py` (Python 표준 라이브러리만 사용)
- GLB에 관절별 노드와 Idle/Walk 클립을 포함합니다. 발 교차 보행·팔 스윙·고개·꼬리 움직임을 부드럽게 전환하며 눈 깜빡임과 접지 그림자를 적용합니다. 스킨 변형과 털색 커스터마이징은 포함하지 않습니다. 로드 실패 시 기존 캐릭터를 유지합니다.
- 모델 검증: `python3 scripts/test-cozy-cat.py` — GLB 버퍼·메시 인덱스·법선, 애니메이션 루프와 얼굴 계층 구조를 검사합니다.
- 실제 월드 보행 녹화: [MP4](docs/character-walk.mp4) · [GIF 미리보기](docs/character-walk.gif)
