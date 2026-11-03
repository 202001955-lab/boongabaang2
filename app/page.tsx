import { redirect } from 'next/navigation'
// 월드(3D 동네)는 public/world/index.html 입니다.
export default function Home() { redirect('/world/index.html') }
