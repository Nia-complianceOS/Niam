import { Fragment, ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, userId } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent-blue border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  /**
   * Keyed on the account id, and that key is load-bearing.
   *
   * React reuses a component instance when the element type and position
   * are unchanged, so without this a different user signing in could land
   * on a page whose state still held the previous user's response -- a
   * repository list, a vendor name, a private commit message -- for the
   * frame before the refetch resolved. Changing the key makes React
   * unmount the entire authenticated tree and build a new one, so there is
   * no instance left to hold anything. Fragment takes a key and adds no
   * DOM node, so the layout is untouched.
   */
  return <Fragment key={userId ?? 'anonymous'}>{children}</Fragment>
}
