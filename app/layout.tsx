export const metadata = { title: '붕세권 · 붕어야, 어디니?', description: '우리 동네에서 지금 목격된 붕어빵을 고양이들과 함께 찾아보세요.' }
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' as const }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body style={{ margin: 0 }}>{children}</body></html>
}
