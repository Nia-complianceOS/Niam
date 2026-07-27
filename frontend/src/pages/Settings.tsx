import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'
import { 
  Building2, 
  Key, 
  Bell, 
  Github, 
  Database, 
  CheckCircle2, 
  AlertCircle,
  Save,
  Eye,
  EyeOff
} from 'lucide-react'

// Tab definitions
const TABS = [
  { id: 'profile', label: 'Organization', icon: Building2 },
  { id: 'integrations', label: 'API & Integrations', icon: Key },
  { id: 'notifications', label: 'Notifications', icon: Bell },
]

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Tab 1 State
  const [orgName, setOrgName] = useState(user?.name || 'Admin Workspace')
  const [adminEmail, setAdminEmail] = useState(user?.email || 'admin@example.com')

  // Tab 2 State
  const [webhookSecret, setWebhookSecret] = useState('whsec_xxxxxxxxxxxxxxx')
  const [showSecret, setShowSecret] = useState(false)
  const [neo4jUri, setNeo4jUri] = useState('bolt://localhost:7687')
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Tab 3 State
  const [alertsDrift, setAlertsDrift] = useState(true)
  const [alertsPr, setAlertsPr] = useState(true)
  const [alertsSeverity, setAlertsSeverity] = useState(true)
  const [alertFrequency, setAlertFrequency] = useState('realtime')

  const handleSave = () => {
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }, 800)
  }

  const testConnection = () => {
    setIsTestingConnection(true)
    setConnectionStatus('idle')
    setTimeout(() => {
      setIsTestingConnection(false)
      setConnectionStatus('success')
    }, 1200)
  }

  return (
    <div className="max-w-[1000px] mx-auto w-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-text">Settings</h1>
          <p className="mt-1 text-[14px] text-text-dim">Manage your workspace preferences and integrations.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-accent-blue text-white px-4 py-2 rounded-[8px] text-[13.5px] font-medium hover:bg-accent-blue/90 transition-all flex items-center gap-2 disabled:opacity-70 shadow-lg shadow-accent-blue/20"
        >
          {isSaving ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle2 size={16} />
          ) : (
            <Save size={16} />
          )}
          {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="flex gap-8">
        {/* Sidebar Tabs */}
        <div className="w-[220px] flex-shrink-0 flex flex-col gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-[13.5px] font-medium transition-all text-left ${
                  isActive 
                    ? 'bg-white/[0.06] text-text' 
                    : 'text-text-dim hover:bg-white/[0.03] hover:text-text'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-accent-blue' : 'text-text-faint'} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content Area */}
        <Card className="flex-1 p-0 overflow-hidden bg-surface/40 backdrop-blur-sm border-border-soft">
          
          {/* Tab 1: Profile */}
          {activeTab === 'profile' && (
            <div className="p-8 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h2 className="text-[16px] font-semibold text-text mb-1">Organization Profile</h2>
                <p className="text-[13px] text-text-dim">Basic information about your NIA workspace.</p>
              </div>

              <div className="flex flex-col gap-5 max-w-[480px]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-text-dim ml-1">Workspace Name</label>
                  <input 
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full bg-black/20 border border-border-soft rounded-[8px] px-3.5 py-2.5 text-[14px] text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-text-dim ml-1">Admin Contact Email</label>
                  <input 
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full bg-black/20 border border-border-soft rounded-[8px] px-3.5 py-2.5 text-[14px] text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
                  />
                </div>

                <div className="mt-4 p-5 rounded-[12px] bg-gradient-to-r from-accent-purple/[0.08] to-accent-blue/[0.08] border border-accent-blue/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[12px] text-accent-blue font-semibold uppercase tracking-wider mb-1">Current Plan</div>
                      <div className="text-[18px] font-bold text-text flex items-center gap-2">
                        {user?.plan || 'Growth Plan'}
                        <span className="px-2 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue text-[11px] font-medium">Active</span>
                      </div>
                    </div>
                    <button className="text-[13px] font-medium text-text hover:text-accent-blue transition-colors px-3 py-1.5 bg-white/5 rounded-md border border-border-soft">
                      Manage billing
                    </button>
                  </div>
                  <div className="mt-4 text-[13px] text-text-dim">
                    Includes up to 50 active repositories and real-time compliance scanning.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Integrations */}
          {activeTab === 'integrations' && (
            <div className="p-8 flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* GitHub */}
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-border-soft">
                    <Github size={20} className="text-text" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-semibold text-text">GitHub Integration</h2>
                    <p className="text-[13px] text-text-dim">Configure webhook secrets and repo sync.</p>
                  </div>
                </div>

                <div className="pl-[52px] flex flex-col gap-5 max-w-[500px]">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-text-dim ml-1">Webhook Secret Key</label>
                    <div className="relative">
                      <input 
                        type={showSecret ? "text" : "password"}
                        value={webhookSecret}
                        onChange={(e) => setWebhookSecret(e.target.value)}
                        className="w-full bg-black/20 border border-border-soft rounded-[8px] pl-3.5 pr-10 py-2.5 text-[14px] text-text font-mono placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text transition-colors"
                      >
                        {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-[13px]">
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle2 size={16} />
                      <span className="font-medium">Webhooks active</span>
                    </div>
                    <span className="text-text-dim">Last sync: 2m ago</span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-border-soft w-full" />

              {/* Neo4j */}
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-blue/10 flex items-center justify-center border border-accent-blue/20">
                    <Database size={20} className="text-accent-blue" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-semibold text-text">Neo4j Graph Database</h2>
                    <p className="text-[13px] text-text-dim">Connection settings for the compliance graph.</p>
                  </div>
                </div>

                <div className="pl-[52px] flex flex-col gap-5 max-w-[500px]">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-text-dim ml-1">Database URI</label>
                    <input 
                      type="text"
                      value={neo4jUri}
                      onChange={(e) => setNeo4jUri(e.target.value)}
                      placeholder="bolt://localhost:7687"
                      className="w-full bg-black/20 border border-border-soft rounded-[8px] px-3.5 py-2.5 text-[14px] text-text font-mono placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={testConnection}
                      disabled={isTestingConnection}
                      className="px-4 py-2 rounded-md bg-white/5 border border-border-soft text-[13px] font-medium text-text hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isTestingConnection && <div className="w-3.5 h-3.5 rounded-full border-2 border-text border-t-transparent animate-spin" />}
                      {isTestingConnection ? 'Testing...' : 'Test Connection'}
                    </button>
                    
                    {connectionStatus === 'success' && (
                      <div className="flex items-center gap-1.5 text-green-400 text-[13px] font-medium animate-in fade-in">
                        <CheckCircle2 size={16} /> Connected
                      </div>
                    )}
                    {connectionStatus === 'error' && (
                      <div className="flex items-center gap-1.5 text-red-400 text-[13px] font-medium animate-in fade-in">
                        <AlertCircle size={16} /> Offline
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Tab 3: Notifications */}
          {activeTab === 'notifications' && (
            <div className="p-8 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h2 className="text-[16px] font-semibold text-text mb-1">Alert Preferences</h2>
                <p className="text-[13px] text-text-dim">Configure how and when you receive compliance alerts.</p>
              </div>

              <div className="flex flex-col gap-6 max-w-[500px]">
                
                {/* Toggles */}
                <div className="flex flex-col gap-4 bg-black/20 border border-border-soft rounded-[12px] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[14px] font-medium text-text">Compliance Drift Detected</div>
                      <div className="text-[12px] text-text-dim mt-0.5">Alert when repositories deviate from active policies.</div>
                    </div>
                    <button 
                      onClick={() => setAlertsDrift(!alertsDrift)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${alertsDrift ? 'bg-accent-blue' : 'bg-surface border border-border-soft'}`}
                    >
                      <div className={`absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full transition-transform ${alertsDrift ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  
                  <div className="h-px w-full bg-border-soft/50" />

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[14px] font-medium text-text">New Pull Request</div>
                      <div className="text-[12px] text-text-dim mt-0.5">Notify when a PR requires compliance review.</div>
                    </div>
                    <button 
                      onClick={() => setAlertsPr(!alertsPr)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${alertsPr ? 'bg-accent-blue' : 'bg-surface border border-border-soft'}`}
                    >
                      <div className={`absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full transition-transform ${alertsPr ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="h-px w-full bg-border-soft/50" />

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[14px] font-medium text-text">High Severity Gaps</div>
                      <div className="text-[12px] text-text-dim mt-0.5">Immediate alert for critical regulation violations.</div>
                    </div>
                    <button 
                      onClick={() => setAlertsSeverity(!alertsSeverity)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${alertsSeverity ? 'bg-accent-blue' : 'bg-surface border border-border-soft'}`}
                    >
                      <div className={`absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full transition-transform ${alertsSeverity ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                {/* Select */}
                <div className="flex flex-col gap-1.5 mt-2">
                  <label className="text-[13px] font-medium text-text-dim ml-1">Email Alert Frequency</label>
                  <select 
                    value={alertFrequency}
                    onChange={(e) => setAlertFrequency(e.target.value)}
                    className="w-full bg-black/20 border border-border-soft rounded-[8px] px-3.5 py-2.5 text-[14px] text-text focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all appearance-none cursor-pointer"
                  >
                    <option value="realtime">Real-time (As events happen)</option>
                    <option value="daily">Daily Digest (8:00 AM)</option>
                    <option value="weekly">Weekly Summary (Monday)</option>
                  </select>
                </div>

              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
