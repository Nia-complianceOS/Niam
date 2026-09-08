import type { Gap, GapKind, GapSeverity } from '@/types/api'

/**
 * Plain English for everything the graph stores as a slug.
 *
 * The audience for a compliance finding is a lawyer, not the engineer who
 * wrote the scanner. "undisclosed_sharing / credit_card" is precise and
 * unreadable; "Shared without disclosure — Credit card details" is the
 * same fact in language someone can act on. Every label here is a
 * translation, never an embellishment: nothing is claimed that the gap
 * does not already assert.
 */

export const DATA_TYPE_LABELS: Record<string, string> = {
  email: 'Email address',
  phone: 'Phone number',
  address: 'Postal address',
  date_of_birth: 'Date of birth',
  government_id: 'Government ID',
  credit_card: 'Card / payment details',
  ip_address: 'IP address',
  user_id: 'Account identifier',
  username: 'Username',
  password: 'Password',
  session_token: 'Session token',
  device_id: 'Device identifier',
  location: 'Location',
  message_content: 'Message content',
  search_query: 'Search history',
  locale_or_language: 'Language preference',
  activity_timestamp: 'Activity timestamps',
  consent_or_age: 'Consent / age information',
  profile_data: 'Profile information',
  notification_metadata: 'Notification data',
  internal_job_metadata: 'Internal job data',
  other_personal_data: 'Other personal data',
}

export function dataTypeLabel(name: string): string {
  return DATA_TYPE_LABELS[name] ?? name.replace(/_/g, ' ')
}

interface KindCopy {
  /** Short label for a list row. */
  label: string
  /** One sentence a non-technical reader can act on. */
  meaning: string
  /** What resolving it actually changes. */
  fix: string
}

const KIND_COPY: Record<GapKind | 'unknown', KindCopy> = {
  undisclosed_sharing: {
    label: 'Shared without disclosure',
    meaning:
      'This data leaves your systems and goes to a third party that none of your published documents names.',
    fix: 'Add a section naming that recipient and what is shared with them.',
  },
  undisclosed_collection: {
    label: 'Collected without disclosure',
    meaning:
      'Your code collects this and no published document tells users you do.',
    fix: 'Add a disclosure describing what is collected and why.',
  },
  ungoverned_egress: {
    label: 'Shared with nothing governing it',
    meaning:
      'This data goes to a third party and no obligation in the DPDP Act covers it.',
    fix: 'Record the basis for the transfer and the safeguards around it.',
  },
  ungoverned_collection: {
    label: 'Collected with nothing governing it',
    meaning:
      'You hold this data and no obligation in the Act has been mapped to it.',
    fix: 'Record why it is collected and under which ground.',
  },
  future_obligation: {
    label: 'Obligation not yet in force',
    meaning:
      'A rule covers this data, but it has not commenced yet. This is readiness work, not a breach today.',
    fix: 'Prepare the wording now so it is in place on the commencement date.',
  },
  unknown: {
    label: 'Finding',
    meaning: 'This finding has no recorded classification.',
    fix: 'Review manually.',
  },
}

export function kindCopy(kind: GapKind | null): KindCopy {
  return KIND_COPY[kind ?? 'unknown'] ?? KIND_COPY.unknown
}

/** Sorting weight. Higher is more urgent. */
export const SEVERITY_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

export const SEVERITY_LABELS: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export function severityClasses(severity: GapSeverity | null): string {
  switch (severity) {
    case 'high':
      return 'bg-accent-red/12 text-accent-red border-accent-red/30'
    case 'medium':
      return 'bg-accent-amber/12 text-accent-amber border-accent-amber/30'
    case 'low':
      return 'bg-accent-blue/12 text-accent-blue border-accent-blue/30'
    default:
      return 'bg-white/5 text-text-dim border-border-soft'
  }
}

/**
 * Most urgent first, then most recently detected. Severity was recorded by
 * the reconciler all along and the UI never used it, so a critical
 * undisclosed transfer sat in the same undifferentiated list as a
 * low-severity readiness item.
 */
export function sortGaps(gaps: Gap[]): Gap[] {
  return [...gaps].sort((a, b) => {
    const rank =
      (SEVERITY_RANK[b.severity ?? ''] ?? 0) -
      (SEVERITY_RANK[a.severity ?? ''] ?? 0)
    if (rank !== 0) return rank
    return (b.detected_at ?? '').localeCompare(a.detected_at ?? '')
  })
}

/** A one-line summary for a list row, in plain language. */
export function gapHeadline(gap: Gap): string {
  const types = gap.data_types.map(dataTypeLabel)
  const subject =
    types.length === 0
      ? 'Personal data'
      : types.length === 1
        ? types[0]
        : `${types[0]} +${types.length - 1} more`
  return gap.vendor ? `${subject} → ${gap.vendor}` : subject
}

/** Free-text search across the fields a person would actually type. */
export function gapMatches(gap: Gap, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    gap.title,
    gap.vendor ?? '',
    gap.severity ?? '',
    kindCopy(gap.kind).label,
    ...gap.data_types.map(dataTypeLabel),
    ...gap.data_types,
    gap.source_file ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

export const GAP_STATUS_LABELS: Record<string, string> = {
  open: 'Needs attention',
  fix_generated: 'Fix drafted',
  pr_opened: 'With legal',
  resolved: 'Resolved',
}

/**
 * Turn a backend action failure into something a compliance reviewer can
 * act on.
 *
 * The API's `detail` is written for whoever has a terminal open. Shown
 * verbatim in the review panel it produced things like
 *
 *   Gap 'gap-b92429...-email-Mixpanel' has no document to amend -- its
 *   drafts carry no file_path. Run legal/load_policies.py and reconcile.
 *
 * next to a "Send for legal review" button, to a reader who has no
 * terminal, no file_path and no idea what reconciling is. The underlying
 * cause is real and worth surfacing -- it just has to be said in the
 * reader's terms.
 */
export function readableActionError(detail: string): {
  title: string
  message: string
} {
  const d = detail.toLowerCase()

  if (d.includes('no document to amend') || d.includes('file_path')) {
    return {
      title: 'There is no document to change for this finding',
      message:
        'This finding is about how data is handled rather than about what ' +
        'your published policy says, so there is no wording for Niam to ' +
        'amend. Record the decision with your legal team instead.',
    }
  }
  if (d.includes('connect your github')) {
    return {
      title: 'GitHub is not connected',
      message:
        'Niam needs access to the repository before it can propose a change ' +
        'to it. Connect GitHub on the Repositories page and try again.',
    }
  }
  if (d.includes('not permitted') || d.includes('allow')) {
    return {
      title: 'This repository is not on the approved list',
      message:
        'Niam will only open pull requests against repositories that have ' +
        'been explicitly approved, so a misconfiguration cannot write to ' +
        'the wrong place. Ask whoever administers this instance to add it.',
    }
  }
  if (d.includes('already resolved')) {
    return {
      title: 'This finding is already resolved',
      message: 'A later scan no longer found it, so there is nothing to fix.',
    }
  }
  return {
    title: 'That did not work',
    message: detail,
  }
}
