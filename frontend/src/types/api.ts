// Mirrors backend/app/schemas/common.py — keep these two in sync manually
// until we generate one from the other via the OpenAPI schema.

export type ComplianceStatus = 'compliant' | 'warning' | 'gap' | 'unknown'
export type GapStatus = 'open' | 'fix_generated' | 'pr_opened' | 'resolved'
export type PRStatus = 'ready_for_review' | 'awaiting_author' | 'merged' | 'closed'
export type RegulationCode = 'DPDP' | 'GDPR' | 'SOC2' | 'HIPAA'

export interface CommitRef {
  sha: string
  message: string
  author: string
  repo: string
  branch: string
  committed_at: string
}

// --- graph.py -----------------------------------------------------------

export interface GraphNode {
  id: string
  label: string
  node_type: string
  status: ComplianceStatus
  status_detail: string
  data_collected: string
  purpose: string
  retention: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relationship: string
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  generated_at: string
}

// --- gaps.py --------------------------------------------------------------

export interface RemediationDraft {
  document: string
  summary: string
  file_path: string | null
  diff_text: string | null
}

export interface Gap {
  id: string
  title: string
  status: GapStatus
  source_commit: CommitRef | null
  vendor: string | null
  data_types: string[]
  affected_documents: string[]
  regulations: RegulationCode[]
  ai_recommendation: string
  remediation_drafts: RemediationDraft[]
  pr_id: string | null
  detected_at: string
  updated_at: string
}

export interface GapsResponse {
  score: number
  score_delta: number
  open_gap_count: number
  gaps: Gap[]
}

export interface GenerateFixResponse {
  gap_id: string
  remediation_drafts: RemediationDraft[]
}

// --- dashboard.py -----------------------------------------------------------

export interface StatCard {
  label: string
  value: string
  sub_label: string
  sub_tone: 'good' | 'warn' | 'neutral'
}

export interface TimelineStep {
  title: string
  meta: string
  state: 'done' | 'active' | 'pending'
  tag: string | null
  tag_tone: 'warn' | 'wait' | null
}

export interface CommitActivity {
  commit: CommitRef
  has_compliance_impact: boolean
  diff_stat: string
}

export interface DashboardSummaryResponse {
  stat_cards: StatCard[]
  timeline: TimelineStep[]
  recent_commits: CommitActivity[]
  synced_at: string
}

// --- repos.py -----------------------------------------------------------

export interface Repository {
  id: string
  full_name: string
  branch: string
  score: number
  last_scanned_at: string
  status: ComplianceStatus
  status_detail: string
}

export interface ReposResponse {
  repositories: Repository[]
}

// --- vendors.py -----------------------------------------------------------

export interface Vendor {
  id: string
  name: string
  category: string
  data_collected: string
  coverage_status: ComplianceStatus
  coverage_detail: string
  connection_active: boolean
}

export interface VendorsResponse {
  vendors: Vendor[]
}

// --- regulations.py ---------------------------------------------------------

export interface RegulationCoverage {
  code: RegulationCode
  score_label: string
  enabled: boolean
  missing_requirements: string[]
  mapped_controls: string[]
  affected_systems: string[]
}

export interface RegulationsResponse {
  regulations: RegulationCoverage[]
}

// --- policies.py ------------------------------------------------------------

export interface Policy {
  id: string
  name: string
  status: ComplianceStatus
  status_label: string
  description: string
  coverage_percent: number
}

export interface PoliciesResponse {
  policies: Policy[]
}

// --- prs.py -------------------------------------------------------------

export interface PullRequest {
  id: string
  gap_id: string
  title: string
  repo_full_name: string
  status: PRStatus
  opened_by: string
  reviewer: string
  regulations: RegulationCode[]
  files: RemediationDraft[]
  github_pr_url: string | null
  opened_at: string
  updated_at: string
}

export interface PRsResponse {
  pull_requests: PullRequest[]
}

export interface OpenPRResponse {
  pull_request: PullRequest
}

// --- audit.py -------------------------------------------------------------

export interface AuditEvent {
  id: string
  occurred_at: string
  event_type: string
  title: string
  description: string
  actor: string
}

export interface AuditResponse {
  events: AuditEvent[]
}