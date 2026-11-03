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
