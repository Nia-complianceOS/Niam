import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Link } from 'react-router-dom'
import { ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { useVendors } from '@/hooks/useVendors'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'
import { Search, Server, Link2, ArrowRight } from 'lucide-react'

export default function Vendors() {
  useSEO({
    title: 'Third-Party Processors',
    description: 'Third-party vendors and data processors detected across your codebases.'
  })

  const { data, loading, error } = useVendors()
  const [searchQuery, setSearchQuery] = useState('')

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Third-Party Inventory"
          title="Vendors & Data Processors"
          subtitle="External processors, cloud services, and data sinks detected across your scanned repositories."
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Third-Party Inventory"
          title="Vendors & Data Processors"
          subtitle="External processors, cloud services, and data sinks detected across your scanned repositories."
        />
        <TableSkeleton rows={4} />
      </div>
    )
  }

  const vendors = data?.vendors ?? []
  
  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (v.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.data_collected || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-[1280px]"
    >
      <PageHeader
        eyebrow="Third-Party Inventory"
        title="Vendors & Data Processors"
        subtitle="External processors, cloud services, and data sinks detected across your scanned repositories."
      />
      
      {vendors.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-4">
          <div className="text-xs font-mono text-text-muted flex items-center gap-3">
            <div>
              <span className="font-semibold text-text-primary">{vendors.length}</span> processors indexed
            </div>
            <span>·</span>
            <div>
              <span className="font-semibold text-text-primary">
                {vendors.filter((v) => v.connection_active).length}
              </span>{' '}
              active API integrations
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Filter by vendor, category, or data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-sunken border border-border rounded px-3 py-1.5 pl-9 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong font-mono transition-colors"
            />
          </div>
        </div>
      )}

      {vendors.length === 0 ? (
        <GetStartedState
          title="No Processors Identified"
          message="Scan a repository to discover external processors in your codebase. Niam audits import ASTs, SDK instantiations, and network configurations to index outside data recipients."
        />
      ) : (
        <Card className="overflow-hidden border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-sunken border-b border-border text-[11px] font-mono text-text-muted uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">Processor Entity</th>
                  <th className="px-5 py-3 font-medium">Domain Category</th>
                  <th className="px-5 py-3 font-medium">Data Transmitted</th>
                  <th className="px-5 py-3 font-medium">DPDP Status</th>
                  <th className="px-5 py-3 font-medium">Detection Source</th>
                  <th className="px-5 py-3 font-medium text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-sans text-xs">
                {filteredVendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-surface-raised transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-text-primary flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm bg-accent-vendor/60 flex-shrink-0" />
                        <span>{vendor.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary">
                      <span className="font-mono text-[11px] text-text-muted bg-surface-sunken px-2 py-0.5 rounded border border-border-subtle">
                        {vendor.category || 'General Processor'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary max-w-[240px] truncate" title={vendor.data_collected}>
                      {vendor.data_collected ? (
                        <span className="font-mono text-[11px]">{vendor.data_collected}</span>
                      ) : (
                        <span className="text-text-muted italic">Uncategorized flow</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={vendor.coverage_status === 'compliant' ? 'good' : vendor.coverage_status === 'gap' ? 'gap' : vendor.coverage_status === 'warning' ? 'warn' : 'muted'}>
                        {vendor.coverage_detail || vendor.coverage_status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        {vendor.connection_active ? (
                          <span className="inline-flex items-center gap-1 text-accent-vendor">
                            <Link2 size={12} />
                            Verified API
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-text-muted">
                            <Server size={12} />
                            AST Static Code
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/gaps?vendor=${encodeURIComponent(vendor.name)}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-text-primary group-hover:text-accent-clause transition-colors"
                      >
                        <span>Gaps</span>
                        <ArrowRight size={12} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredVendors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-text-muted font-mono text-xs">
                      No processors matched query "{searchQuery}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  )
}