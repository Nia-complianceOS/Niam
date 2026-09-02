import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shared/PageStates'
import { getHealth } from '@/services/api/client'
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'

interface Health {
  status: string
  environment: string
  neo4j_connected: boolean
}

/**
 * Read-only status, and nothing else.
 *
 * This page used to present an organisation form, notification toggles, a
 * webhook-secret field prefilled with `whsec_xxxxxxxxxxxxxxx`, and a Neo4j
 * URI box hardcoded to bolt://localhost:7687 -- while the instance runs on
 * Aura. "Save" was a setTimeout that showed a success tick and persisted
 * nothing; "Test Connection" never called the API and its green
 * "Connected" was simulated.
 *
 * Deliberately NOT reinstated: any field that edits the Neo4j URI, the
 * GitHub token or the webhook secret. Those live in .env, and a UI that
 * appears to change them while doing nothing is worse than no UI at all.
 */
export default function Settings() {
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
    <div className="flex items-center justify-between py-2.5 border-b border-border-soft/50 last:border-0">
      <div className="text-[13px] text-text-dim">{label}</div>
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-text">
        {ok === true && <CheckCircle2 size={15} className="text-accent-green" />}
        {ok === false && <AlertCircle size={15} className="text-accent-red" />}
        <span className="font-mono">{value}</span>
      </div>
    </div>
  )

  return (
    <div className="max-w-[720px]">
      <PageHeader
        eyebrow="System"
        title="Settings"
        subtitle="Live status of this instance. Configuration is read from the server's environment."
      />

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-[15px] font-semibold">Backend status</div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border-soft text-[12px] text-text-dim hover:bg-white/5 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="text-sm text-accent-red">
            Couldn't reach the backend: {error}
          </div>
        ) : health ? (
          <div>
            <Row label="API" value={health.status} ok={health.status === 'ok'} />
            <Row label="Environment" value={health.environment} />
            <Row
              label="Neo4j"
              value={health.neo4j_connected ? 'connected' : 'unreachable'}
              ok={health.neo4j_connected}
            />
          </div>
        ) : (
          <div className="text-sm text-text-dim">Checking…</div>
        )}
      </Card>

      <Card className="p-5 mt-4">
        <div className="font-display text-[15px] font-semibold mb-1.5">Configuration</div>
        <div className="text-[13px] text-text-dim leading-relaxed">
          Neo4j credentials, the GitHub token and the webhook secret are read from the
          server's <span className="font-mono text-text">.env</span> file and are not
          editable here. Changing them requires editing that file and restarting the API.
        </div>
      </Card>
    </div>
  )
}
