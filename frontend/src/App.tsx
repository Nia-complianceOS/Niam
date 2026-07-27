import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Dashboard from '@/pages/Dashboard'
import Graph from '@/pages/Graph'
import Repositories from '@/pages/Repositories'
import Vendors from '@/pages/Vendors'
import Regulations from '@/pages/Regulations'
import Policies from '@/pages/Policies'
import PullRequests from '@/pages/PullRequests'
import AuditTrail from '@/pages/AuditTrail'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/graph" element={<Graph />} />
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
  )
}