import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, PageHeader } from '@/components/shared/PageStates'
import { useVendors } from '@/hooks/useVendors'

export default function Vendors() {
  const { data, loading, error } = useVendors()

  if (loading) return <LoadingState label="Loading vendors…" />
  if (error || !data) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="External Services"
        title="Vendors"
        subtitle="Understand which vendors are connected and how much coverage they have."
      />
      <div className="grid gap-3">
        {data.vendors.map((vendor) => (
          <Card key={vendor.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">{vendor.name}</div>
              <div className="text-sm text-text-dim">{vendor.category} • {vendor.data_collected}</div>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={vendor.coverage_status === 'compliant' ? 'good' : vendor.coverage_status === 'gap' ? 'gap' : 'muted'}>
                {vendor.coverage_detail}
              </Badge>
              <Badge tone={vendor.connection_active ? 'muted' : 'gap'}>
                {vendor.connection_active ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}