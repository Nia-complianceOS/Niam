import { Card } from '@/components/ui/Card'

export default function Settings() {
  return (
    <div className="max-w-[1280px]">
      <Card className="p-6">
        <h1 className="font-display text-[24px] font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-text-dim">Workspace and integration settings will appear here.</p>
      </Card>
    </div>
  )
}
