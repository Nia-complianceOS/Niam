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
    title: 'Settings',
    description: 'Account and workspace settings'
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
    <div className="flex items-center justify-between py-3 border-b border-border-soft/50 last:border-0">
      <div className="text-[13px] text-text-dim">{label}</div>
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-text">
        {ok === true && <CheckCircle2 size={15} className="text-accent-green" />}
        {ok === false && <AlertCircle size={15} className="text-accent-red" />}
        <span className="font-mono">{value}</span>
      </div>
    </div>
  )

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[720px]"
    >
      <PageHeader
        eyebrow="System"
        title="Settings"
        subtitle="Manage your instance connection, configuration, and workspace data."
      />

      <div className="grid gap-6">
        {/* API Status */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Server size={16} className="text-accent-blue" />
            <h2 className="font-semibold text-[15px] text-text">Account & Status</h2>
          </div>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] text-text-dim">Backend connectivity and environment.</div>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border-soft text-[12px] text-text-dim hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            <div className="mt-4">
              {error ? (
                <div className="text-[13px] p-3 rounded bg-accent-red/10 border border-accent-red/20 text-accent-red">
                  Couldn't reach the backend: {error}
                </div>
              ) : health ? (
                <div className="rounded-lg border border-border-soft/50 bg-black/20 px-4">
                  <Row label="API Status" value={health.status} ok={health.status === 'ok'} />
                  <Row label="Environment" value={health.environment} />
                  <Row
                    label="Neo4j Connection"
                    value={health.neo4j_connected ? 'connected' : 'unreachable'}
                    ok={health.neo4j_connected}
                  />
                </div>
              ) : (
                <div className="text-[13px] text-text-faint py-2">Checking connectivity…</div>
              )}
            </div>
          </Card>
        </section>

        {/* GitHub Config */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Github size={16} className="text-text" />
            <h2 className="font-semibold text-[15px] text-text">GitHub Connection</h2>
          </div>
          <Card className="p-5">
            <div className="text-[13.5px] text-text-dim leading-relaxed mb-4">
              GitHub tokens and webhook secrets are read securely from the server's environment file (<span className="font-mono text-text bg-white/5 px-1 py-0.5 rounded">.env</span>) and are not editable here.
            </div>
            <div className="text-[12.5px] p-3 rounded-lg bg-accent-amber/10 border border-accent-amber/20 text-accent-amber">
              To update your token or webhook secret, you must modify the server environment file and restart the Niam API service.
            </div>
          </Card>
        </section>

        {/* Danger Zone */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <AlertTriangle size={16} className="text-accent-red" />
            <h2 className="font-semibold text-[15px] text-accent-red">Danger Zone</h2>
          </div>
          <Card className="p-5 border-accent-red/20 bg-accent-red/[0.02]">
            <div className="text-[13.5px] text-text-dim leading-relaxed mb-4">
              Irreversible actions that affect your entire workspace. Deleting your findings will clear all mapped data types, vendors, and identified gaps.
            </div>
            <ResetWorkspacePanel />
          </Card>
        </section>
      </div>
    </motion.div>
  )
}
