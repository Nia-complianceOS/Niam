import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingState, ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { useVendors } from '@/hooks/useVendors'

export default function Vendors() {
  const { data, loading, error } = useVendors()

  if (loading) return <LoadingState label="Loading vendors…" />
  if (error) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="External Services"
        title="Vendors"
        subtitle="Vendors referenced in your scanned code, and which of them you actually integrate with."
      />
      {data && data.vendors.length > 0 && (
        <div className="text-sm text-text-dim mb-4">
          <span className="font-semibold text-text">{data.vendors.length}</span> detected
          {' · '}
          <span className="font-semibold text-text">
            {data.vendors.filter((v) => v.connection_active).length}
          </span>{' '}
          connected via a vendor API
        </div>
      )}
      {!data || data.vendors.length === 0 ? (
        <GetStartedState
          title="No vendors found yet"
          message="Connect GitHub and scan a repository to get started. Niam lists the outside services your code sends data to — payment providers, analytics, cloud storage — so you can check each one is covered."
        />
      ) : (
        <div className="grid gap-3">
          {data.vendors.map((vendor) => (
            <Card key={vendor.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">{vendor.name}</div>
                <div className="text-sm text-text-dim">
                  {vendor.category ? `${vendor.category} • ` : ''}{vendor.data_collected}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={vendor.coverage_status === 'compliant' ? 'good' : vendor.coverage_status === 'gap' ? 'gap' : 'muted'}>
                  {vendor.coverage_detail}
                </Badge>
                {/* "Connected" means an ingestion run actually talked to this
                    vendor's API. Everything else was merely named in scanned
                    source code, which is not an integration. */}
                <Badge tone={vendor.connection_active ? 'good' : 'muted'}>
                  {vendor.connection_active ? 'Connected' : 'Detected in code'}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}