import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto px-10 pt-[30px] pb-[60px]">
        <Outlet />
      </div>
    </div>
  )
}