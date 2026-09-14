# Niam Design System: The Regulatory Ledger

## 1. Design Point of View & Philosophy

Niam is an automated continuous compliance and statutory risk governance platform built for India's **Digital Personal Data Protection (DPDP) Act 2023**. Its interface must inspire immediate trust and judicial authority for enterprise General Counsel, Chief Privacy Officers, and venture auditors, while preserving forensic rigor for the engineering leaders resolving compliance pull requests.

### Recommendation & Justification
We adopt **The Regulatory Ledger** aesthetic over generic startup friendliness or raw terminal minimalism.
Niam is fundamentally an arbitration engine between statutory law and software codebases. Its most valuable outputs are not raw AST dumps, but human-readable statutory reasoning, executive liability assessments, and drafted policy amendments. A purely technical, mono-heavy or generic glassmorphic UI degrades user confidence and makes the platform look like a hackathon script wrapper. By pairing an authoritative, literary display serif (*Newsreader*) for statutory headings, regulatory assertions, and landing page editorial copy with an engineered, clinical Swiss sans (*Inter*) for data tables, metrics, and interactive controls (and system monospace strictly for file paths, AST symbols, and git hashes), Niam evokes the gravitas of a legal precedent binder and the forensic certainty of an institutional audit instrument.

### Core Visual Principles
- **No Decorative Gradient Soup or Default Glassmorphism**: Eliminate generic purple/blue ambient gradient blobs, floating blur circles, and default glass cards. Structure is defined by hairline architectural borders (`1px solid var(--border)`).
- **Color Quarantined to Semantic Purpose**: Saturated color is strictly functional, representing statutory severity (Gap vs. Compliant vs. Warning) or Graph Ontology (System vs. DataType vs. Vendor vs. Clause). Interface chrome remains neutral and understated.
- **Rhythmic Density by Context**: Data-dense environments (Compliance Graph, Gaps Queue, Repository AST breakdown) use compact row heights (36–38px) and tight padding (`px-3 py-2`); executive views (Dashboard, Policy Review, Landing Hero) breathe with generous architectural margins.
- **Lawyer-First Prose & Explanations**: Findings, PR reviews, and compliance gaps are presented in articulated statutory English with legal rationale and citations, not raw regex matches or unformatted JSON diffs.
- **Zero Fabricated Data Discipline**: Every number, status, badge, and timeline node traces directly to an actual API response. Missing backend fields are cataloged in a strict "NEEDS BACKEND" register rather than faked with placeholders.

---

## 2. Color System & Semantic Tokens

### Canvas & Surfaces
| Token | Dark (Primary) | Light | Semantic Role |
| :--- | :--- | :--- | :--- |
| `bg` | `#090A0E` | `#FBFBFD` | Root canvas / deep background |
| `bg-subtle` | `#101217` | `#F1F3F6` | Sidebar, breadcrumb bar, table headers |
| `bg-elevated` | `#161920` | `#FFFFFF` | Floating toolbars, dropdowns, sheet drawers |
| `surface` | `#14171F` | `#FFFFFF` | Primary cards, data containers, panels |
| `surface-elevated`| `#1C202B` | `#F8FAFC` | Modals, active popovers, tooltip overlays |
| `card` | `#14171F` | `#FFFFFF` | Metric panels and findings cards |

### Hairline Borders
| Token | Dark | Light | Role |
| :--- | :--- | :--- | :--- |
| `border` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.09)` | Primary structural divider |
| `border-subtle` | `rgba(255,255,255,0.04)` | `rgba(0,0,0,0.04)` | Internal cell borders, sub-dividers |
| `border-soft` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)` | Secondary container borders |

### Typographic Hierarchy Colors
| Token | Dark | Light | Role |
| :--- | :--- | :--- | :--- |
| `text-primary` | `#F1F3F7` | `#0E1118` | Primary headlines, active values, legal claims |
| `text-secondary` | `#9BA3AF` | `#4B5565` | Body prose, table content, form labels |
| `text-tertiary` | `#5D6475` | `#8C95A6` | Eyebrow labels, timestamps, column headers |

### Semantic Status & Statutory Severity
*Color is restricted strictly to these functional indicators:*
| Token | Dark | Light | Statutory Meaning |
| :--- | :--- | :--- | :--- |
| `status-gap` | `#F43F5E` (Crimson) | `#E11D48` | Critical non-compliance, statutory breach, ungoverned data egress |
| `status-warning` | `#F59E0B` (Amber) | `#D97706` | Elevated scrutiny, missing consent artifact, pending counsel review |
| `status-compliant` | `#10B981` (Emerald) | `#059669` | Governed data flow, verified DPDP clause alignment, merged PR |
| `status-neutral` | `#64748B` (Slate) | `#64748B` | Quiescent clause, informational reference, unanalyzed entity |

### Knowledge Graph Ontology Tokens
*Used exclusively in the D3 compliance knowledge graph canvas:*
| Token | Hex | Ontology Entity |
| :--- | :--- | :--- |
| `entity-system` | `#38BDF8` (Sky) | AST-mapped codebases, services, repositories |
| `entity-datatype` | `#A78BFA` (Orchid) | PII, biometric data, identifiers, credentials |
| `entity-vendor` | `#FBBF24` (Amber) | Third-party data processors, cloud APIs, SDKs |
| `entity-clause` | `#34D399` (Jade) | DPDP Act statutory sections (Sec 4, 5, 6, 8, etc.) |

---

## 3. Typographic Scale (2-Typeface System)

We restrict the interface to **two loaded font families**:
1. **Display & Editorial Serif**: *Newsreader* (Google Fonts serif with optical sizes, designed specifically for high-legibility legal and editorial contexts).
2. **Interface & Body Sans**: *Inter* (Clean, clinical Swiss grotesque optimized for screen UI and high-density tables).
*(System Monospace is used for AST tokens, commit hashes, and file paths without loading an extra webfont).*

| Scale Token | Size / Line-Height | Tracking | Family / Weight | Application |
| :--- | :--- | :--- | :--- | :--- |
| `display-2xl` | 3.5rem (56px) / 1.1 | -0.025em | Newsreader Medium | Landing page hero lead assertion |
| `display-xl` | 2.25rem (36px) / 1.15 | -0.02em | Newsreader Regular | Page titles, major statutory sections |
| `title-lg` | 1.5rem (24px) / 1.25 | -0.015em | Newsreader Regular | Drawer headlines, modal titles |
| `title-md` | 1.125rem (18px) / 1.35 | -0.01em | Inter Medium (500) | Card headers, table section titles |
| `body-base` | 0.875rem (14px) / 1.5 | normal | Inter Regular (400) | Legal reasoning prose, PR descriptions |
| `body-dense` | 0.8125rem (13px) / 1.45 | normal | Inter Regular (400) | Data table cells, navigation links, logs |
| `mono-code` | 0.75rem (12px) / 1.4 | normal | System Mono | File paths, commit SHAs, code identifiers |
| `eyebrow` | 0.6875rem (11px) / 1.2 | +0.08em | Inter SemiBold (600) | Uppercase badges, table column headers |

---

## 4. Spacing & Grid Rhythm

- **Micro-density for Data Zones** (`px-3 py-2`, `gap-2`, row height 38px):
  Used in Compliance Graph toolbar, Gaps table, Repository scan logs, and AST drawer.
- **Structured Rhythm for Executive Panels** (`p-5` to `p-6`, `gap-5`):
  Used in Dashboard metrics, Risk Heatmap, Regulation clauses, Policy review.
- **Editorial Asymmetry for Public & Presentation Zones** (`py-20 lg:py-28`, `px-8`):
  Left-aligned, authoritative hero statements with asymmetrical ledger mockups, not center-stacked generic SaaS templates.
- **Architectural Radii**:
  - `rounded-sm`: 4px (badges, code chips)
  - `rounded`: 6px (buttons, inputs, menu items)
  - `rounded-md`: 8px (table cards, modal containers)
  - `rounded-lg`: 12px (outer dashboard cards, maximum radius)
  - *No arbitrary `rounded-2xl` or pill buttons unless strictly representing a circular avatar or toggle switch.*

---

## 5. Iconography

- **Library**: Exclusively `lucide-react`.
- **Stroke Width**: `strokeWidth={1.75}` for navigation and general interface icons; `strokeWidth={2}` for micro-badges (12–14px).
- **Consistency**: Strict avoidance of emoji in headers, badges, or table rows. Status is conveyed via Lucide icons (`ShieldAlert`, `CheckCircle2`, `AlertTriangle`, `FileCode2`, `GitPullRequest`) paired with semantic color tokens.

---

## 6. Motion & Interaction

- **Philosophical Rule**: Motion exists to communicate state transitions and hierarchy, never as idle decorative animation.
- **View Transitions**: 180ms ease-out fade with slight 4px vertical translation (`opacity: 1, y: 0` from `y: 4px`).
- **Interactive State Changes**:
  - Gap status transition (open → resolving → resolved): 240ms `easeOutQuad`.
  - Scan progress & SSE stream: Smooth continuous width interpolation with subtle opacity pulse on active step, no jittery bouncing badges.
  - Detail Panels / Drawers: 250ms slide from right (`x: 0` from `x: 100%`) with backdrop fade.
- **No Idle Animations**: Floating background blobs, spinning gradients, and bouncy CTA hover loops are eliminated.
