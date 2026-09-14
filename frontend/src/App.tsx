import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { PageLoader } from '@/components/PageLoader'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'

const LandingPage = lazy(() => import('@/pages/LandingPage'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Graph = lazy(() => import('@/pages/Graph'))
const Gaps = lazy(() => import('@/pages/Gaps'))
const Repositories = lazy(() => import('@/pages/Repositories'))
const Vendors = lazy(() => import('@/pages/Vendors'))
const Regulations = lazy(() => import('@/pages/Regulations'))
const Policies = lazy(() => import('@/pages/Policies'))
const PullRequests = lazy(() => import('@/pages/PullRequests'))
const AuditTrail = lazy(() => import('@/pages/AuditTrail'))
const Settings = lazy(() => import('@/pages/Settings'))
const NotFound = lazy(() => import('@/pages/NotFound'))

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<LandingPage />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/gaps" element={<Gaps />} />
          <Route path="/repositories" element={<Repositories />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/regulations" element={<Regulations />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/pull-requests" element={<PullRequests />} />
          <Route path="/audit" element={<AuditTrail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}