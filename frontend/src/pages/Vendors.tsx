import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Link } from 'react-router-dom'
import { ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { useVendors } from '@/hooks/useVendors'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'
import { Search, Server, Link2, ExternalLink } from 'lucide-react'

export default function Vendors() {
  useSEO({
    title: 'Vendors',
    description: 'Third-party vendors detected in your codebase'
  })

  const { data, loading, error } = useVendors()
  const [searchQuery, setSearchQuery] = useState('')

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="External Services"
          title="Vendors"
          subtitle="Vendors referenced in your scanned code, and which of them you actually integrate with."
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="External Services"
          title="Vendors"
          subtitle="Vendors referenced in your scanned code, and which of them you actually integrate with."
        />
        <TableSkeleton rows={4} />
      </div>
    )
  }

  const vendors = data?.vendors ?? []
  
  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (v.category || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1280px]"
    >
      <PageHeader
        eyebrow="External Services"
        title="Vendors"
        subtitle="Vendors referenced in your scanned code, and which of them you actually integrate with."
      />
      
      {vendors.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
          <div className="text-[13px] text-text-dim">
            <span className="font-semibold text-text">{vendors.length}</span> detected
            {' · '}
            <span className="font-semibold text-text">
              {vendors.filter((v) => v.connection_active).length}
            </span>{' '}
            connected via API
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface/50 border border-border-soft rounded-lg pl-9 pr-3 py-1.5 text-[13px] text-text placeholder-text-faint focus:outline-none focus:border-accent-blue/50"
            />
          </div>
        </div>
      )}

      {vendors.length === 0 ? (
        <GetStartedState
          title="No vendors detected yet"
          message="Scan a repository to discover third-party services in your code. Niam lists the outside services your code sends data to — payment providers, analytics, cloud storage — so you can check each one is covered."
        />
      ) : (
        <div className="overflow-x-auto">
          <Card className="min-w-[800px] overflow-hidden border-border-soft">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/20 border-b border-border-soft text-[12px] font-semibold text-text-faint uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Data Collected</th>
                  <th className="px-4 py-3 font-medium">Coverage Status</th>
                  <th className="px-4 py-3 font-medium">Discovery Method</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft/50">
                {filteredVendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[14px] text-text flex items-center gap-2">
                        {vendor.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-text-dim">
                      {vendor.category || '—'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-text-dim max-w-[200px] truncate" title={vendor.data_collected}>
                      {vendor.data_collected || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={vendor.coverage_status === 'compliant' ? 'good' : vendor.coverage_status === 'gap' ? 'gap' : vendor.coverage_status === 'warning' ? 'warn' : 'muted'}>
                        {vendor.coverage_detail}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-[12.5px]">
                        {vendor.connection_active ? (
                          <>
                            <Link2 size={13} className="text-accent-blue" />
                            <span className="text-text">Connected API</span>
                          </>
                        ) : (
                          <>
                            <Server size={13} className="text-text-faint" />
                            <span className="text-text-dim">Detected in code</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/gaps?vendor=${encodeURIComponent(vendor.name)}`}
                        className="inline-flex items-center justify-center text-[12px] font-medium px-2.5 py-1.5 rounded-md bg-white/5 text-text-dim border border-transparent hover:border-border-soft hover:bg-white/10 hover:text-text transition-all"
                      >
                        View gaps <ExternalLink size={12} className="ml-1.5 opacity-50" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredVendors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-text-faint text-[13px]">
                      No vendors found matching "{searchQuery}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </motion.div>
  )
}