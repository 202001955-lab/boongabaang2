import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
// 브라우저에 내려가도 안전한 공개 값(anon key)만 전달합니다. service_role 키는 절대 여기에 넣지 마세요.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  return NextResponse.json({ url, anon }, { headers: { 'Cache-Control': 'no-store' } })
}
