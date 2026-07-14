import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import Graph from '@/pages/Graph'
import Repositories from '@/pages/Repositories'
import Vendors from '@/pages/Vendors'
import Regulations from '@/pages/Regulations'
import Policies from '@/pages/Policies'
import PullRequests from '@/pages/PullRequests'
import AuditTrail from '@/pages/AuditTrail'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/graph" element={<Graph />} />
        <Route path="/repositories" element={<Repositories />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/regulations" element={<Regulations />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/pull-requests" element={<PullRequests />} />
        <Route path="/audit" element={<AuditTrail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}