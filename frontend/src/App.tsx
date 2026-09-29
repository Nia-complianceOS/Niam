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
const Reviews = lazy(() => import('@/pages/Reviews'))
const ReviewDetail = lazy(() => import('@/pages/ReviewDetail'))
const Team = lazy(() => import('@/pages/Team'))
const GitHubComplete = lazy(() => import('@/pages/GitHubComplete'))
const Invite = lazy(() => import('@/pages/Invite'))

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<LandingPage />} />
        {/* Public: GitHub returns here for both sign-in and connect, and an
            invite link is opened before the visitor has signed in. */}
        <Route path="/auth/github/complete" element={<GitHubComplete />} />
        <Route path="/invite/:token" element={<Invite />} />
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
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/reviews/:reviewId" element={<ReviewDetail />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}