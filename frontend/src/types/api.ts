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
  // The node query is capped. These say how much of the graph you are
  // looking at, so a bounded view never passes for the whole thing.
  total_nodes: number
  node_limit: number
  truncated: boolean
  generated_at: string
}

// --- gaps.py --------------------------------------------------------------

export interface RemediationDraft {
  document: string
  summary: string
  file_path: string | null
  diff_text: string | null
}

export type GapSeverity = 'high' | 'medium' | 'low'
export type GapKind = 'ungoverned_egress' | 'future_obligation' | 'ungoverned_collection'

export interface Gap {
  id: string
  title: string
  status: GapStatus
  // Written by the reconciler, dropped by the API until now.
  severity: GapSeverity | null
  kind: GapKind | null
  // "specific" when a clause names this data type, "general" when only
  // the Act's all-personal-data obligations reach it.
  coverage_basis: 'specific' | 'general' | 'none' | null
  source_commit: CommitRef | null
  source_file: string | null
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
  // null when there is nothing to score (empty graph) or the graph could
  // not be read -- render "not applicable", never a number.
  score: number | null
  // null until a previous score exists to compare against.
  score_delta: number | null
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
  // Only the illustrative samples carry a diff stat; a commit rebuilt
  // from :Gap provenance has no diff behind it.
  diff_stat: string
  // Gaps that trace back to this commit. Real and countable.
  gap_count: number
}

export interface DashboardSummaryResponse {
  stat_cards: StatCard[]
  timeline: TimelineStep[]
  recent_commits: CommitActivity[]
  synced_at: string
  // true when timeline/recent_commits are illustrative samples rather
  // than real events. Must be surfaced in the UI when set.
  sample_panels: boolean
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
  // null when the graph never recorded a category. Do not substitute a
  // placeholder like "Third Party" -- that asserts something unknown.
  category: string | null
  data_collected: string
  coverage_status: ComplianceStatus
  coverage_detail: string
  // true ONLY when a vendor-API ingestion actually ran against this
  // vendor. A name the code scanner spotted in source is not a connection.
  connection_active: boolean
  discovered_via: 'vendor_api' | 'code_scan'
}

export interface VendorsResponse {
  vendors: Vendor[]
}

// --- regulations.py ---------------------------------------------------------

export interface RegulationCoverage {
  code: RegulationCode
  // null for a framework that is listed but not enabled -- the backend
  // sends no score for those, and rendering the literal string "null" is
  // worse than rendering nothing.
  score_label: string | null
  enabled: boolean
  missing_requirements: string[]
  mapped_controls: string[]
  affected_systems: string[]
  // Next tranche of the Act that has not commenced yet, from
  // legal/commencement.py. null for frameworks with no schedule.
  next_commencement_date: string | null
  next_commencement_days: number | null
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