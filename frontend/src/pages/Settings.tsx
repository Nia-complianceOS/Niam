import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shared/PageStates'
import { ResetWorkspacePanel } from '@/components/settings/ResetWorkspacePanel'
import { getHealth } from '@/services/api/client'
import { CheckCircle2, AlertCircle, RefreshCw, Server, Github, AlertTriangle } from 'lucide-react'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'

interface Health {
  status: string
  environment: string
  neo4j_connected: boolean
}

export default function Settings() {
  useSEO({
    title: 'System Settings',
    description: 'Instance telemetry, statutory environment, and workspace maintenance.'
  })

  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    setError(null)
    getHealth()
      .then((h) => setHealth(h))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const Row = ({ label, value, ok }: { label: string; value: string; ok?: boolean }) => (
    <div className="flex items-center justify-between py-3 border-b border-border-subtle last:border-0 font-sans text-xs">
      <div className="text-text-secondary">{label}</div>
      <div className="flex items-center gap-2 font-mono text-text-primary">
        {ok === true && <CheckCircle2 size={14} className="text-status-compliant" />}
        {ok === false && <AlertCircle size={14} className="text-danger" />}
        <span>{value}</span>
      </div>
    </div>
  )

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-[760px]"
    >
      <PageHeader
        eyebrow="System Configuration"
        title="Settings & Telemetry"
        subtitle="Instance parameters, database connectivity, and workspace audit maintenance."
      />

      <div className="space-y-6">
        {/* API & Backend Status */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <Server size={15} className="text-accent-clause" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">Instance Health & Telemetry</h2>
          </div>
          <Card className="p-5 border-border bg-surface">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-text-secondary">Core API runtime and graph database connectivity status.</div>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border-strong bg-surface hover:bg-surface-raised text-[11px] font-mono text-text-primary disabled:opacity-40 transition-colors"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                <span>Probe Status</span>
              </button>
            </div>

            <div>
              {error ? (
                <div className="text-xs p-3.5 rounded border border-danger/30 bg-danger/5 text-danger font-mono">
                  Communication failure: {error}
                </div>
              ) : health ? (
                <div className="rounded border border-border-subtle bg-surface-sunken px-4">
                  <Row label="API Status" value={health.status.toUpperCase()} ok={health.status === 'ok'} />
                  <Row label="Environment Tier" value={health.environment} />
                  <Row
                    label="Neo4j Knowledge Graph"
                    value={health.neo4j_connected ? 'OPERATIONAL' : 'UNREACHABLE'}
                    ok={health.neo4j_connected}
                  />
                </div>
              ) : (
                <div className="text-xs font-mono text-text-muted py-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-clause animate-pulse" />
                  Probing backend health...
                </div>
              )}
            </div>
          </Card>
        </section>

        {/* GitHub Config Notice */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <Github size={15} className="text-text-primary" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">Repository Integration Policy</h2>
          </div>
          <Card className="p-5 border-border bg-surface">
            <div className="text-xs text-text-secondary leading-relaxed mb-3 font-sans">
              GitHub authentication tokens, webhook signing secrets, and dry-run execution gates are read securely from the backend environment configuration (<span className="font-mono text-text-primary bg-surface-sunken px-1 py-0.5 rounded border border-border-subtle">.env</span>) to maintain zero-exposure credential posture.
            </div>
            <div className="text-xs p-3.5 rounded border border-border-subtle bg-surface-sunken text-text-muted font-sans flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 flex-shrink-0" />
              <span>To cycle access tokens or modify dry-run flags, update the backend environment file and reload the API service. Settings cannot be overridden from the browser client.</span>
            </div>
          </Card>
        </section>

        {/* Danger Zone */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <AlertTriangle size={15} className="text-danger" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-danger">Destructive Operations</h2>
          </div>
          <Card className="p-5 border-danger/30 bg-danger/5">
            <div className="text-xs text-text-secondary leading-relaxed mb-1 font-sans">
              Irreversible administrative procedures. Resetting will purge all mapped personal data types, discovered processors, and compliance gaps from the knowledge graph.
            </div>
            <ResetWorkspacePanel />
          </Card>
        </section>
      </div>
    </motion.div>
  )
}
