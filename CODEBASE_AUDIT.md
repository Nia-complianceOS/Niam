# Niam — Codebase Audit

Read-only scan. **No code was changed for this report.** The only edit made in this
session was yesterday's `backend/app/core/config.py` Neo4j credential fix.
`.env` files were never opened; only key *names* from the committed `.env.example`
templates were read.

---

## 1. Should you delete `intelligence/`?

**No. Delete the copies in `backend/` instead — but not before the demo.**

### What is actually on disk

`diff -rq` across all seven directories (`demo`, `graph`, `ingestion`, `legal`,
`reasoning`, `reconciliation`, `retrieval`) reports **zero differences**.
`backend/` holds a byte-identical clone of `intelligence/`.

| | `intelligence/` | `backend/{graph,ingestion,…}` |
|---|---|---|
| Tracked by git | **53 files** | **0 files** (all `??` untracked) |
| Has `pyproject.toml` | yes (`nia-intelligence`) | no |

Deleting `intelligence/` would delete **the only committed copy**. Your git history,
and anything your co-founder pulls, would lose the entire intelligence layer while
your local machine kept working — the worst possible failure mode.

### Why the copy-paste "fixed" the backend

`backend/app/services/scan_service.py` imports these as **top-level packages**:

```python
from ingestion.github.scanner import GitHubScanner
from graph.graph_writer import GraphWriter
from reconciliation.reconciler import Reconciler
```

For that to resolve, `graph/` and friends must be importable. `intelligence/pyproject.toml`
already exists and declares exactly those packages — but **`nia-intelligence` is not
installed in `backend/venv`** (no `.dist-info`, no `.pth` entry; verified). So the import
failed. Copying the folders into `backend/` made them resolve only because uvicorn runs
with `backend/` as the working directory, and the working directory is on `sys.path`.

The README already documents the correct fix, and it was simply never run:

```bash
pip install -e ./intelligence     # from backend/venv
```

### The hazard while both copies exist

The backend uses **two contradictory import strategies for the same code**:

- `scan_service.py` → `from reconciliation.reconciler import Reconciler` → loads the **`backend/` copy**
- `gap_service.py:232` → `sys.path.append(os.path.abspath("..")); from intelligence.reasoning.drafter import RemediationDrafter` → loads the **`intelligence/` copy**

Both copies are live in one process at once. Edit `intelligence/graph/schema.py` and the
reconciler won't see it; edit `backend/graph/schema.py` and the drafter won't see it.
This is a silent-divergence bug waiting to happen, and it is the single most valuable
piece of cleanup on this list.

### Recommendation

1. Before the demo: change nothing. It works.
2. After the demo: `pip install -e ./intelligence`, delete `backend/{demo,graph,ingestion,legal,reasoning,reconciliation,retrieval}`, restart, re-run one scan to confirm.
3. Also fix `gap_service.py` to import `reasoning.drafter`, not `intelligence.reasoning.drafter`, so both call sites agree.

---

## 2. Where the "13 vendors" comes from

The number is **real Neo4j data** — that stat card is not mock. But it does not mean
what the UI says it means.

**Vendor nodes are created by the code scanner, not by vendor ingestion.**

`ingestion/github/classifier.py` asks Gemini for a free-text `vendor` field per code
snippet. Its own prompt: *"vendor is free text (e.g. "Stripe", "Redis", "Firebase") or
null."* Then `graph/edge_builder.py` does:

```cypher
MERGE (v:Vendor {name: row.vendor})
```

on that raw string. Three consequences:

- **No taxonomy validation.** `graph/schema.py` has `validate_data_type()` and
  `graph_writer.py` enforces it for `data_type` — there is **no equivalent for `vendor`**.
  Whatever the model emits becomes a node. `Redis`, `AWS`, `Postgres`, `SendGrid`,
  `Twilio`, `Google` are all plausible outputs from scanning any real repo.
- **No normalization.** `Stripe`, `stripe`, and `Stripe API` are three separate nodes,
  because the uniqueness constraint is on the exact string.
- **Your three vendor ingestions (`Stripe` / `Mixpanel` / `Firebase Authentication`) are
  a separate path** that only runs when you execute those CLIs with `--write`. Stripe has
  no key, so it has never run. It contributed nothing to the 13.

**So: 13 = the number of distinct strings Gemini wrote down while reading a repo.**

### The three lines that turn that into "13 Connected Vendors"

| File | Line | Effect |
|---|---|---|
| `backend/app/schemas/vendors.py` | `connection_active: bool = True` | Field defaults to True and **`list_vendors()` never sets it** → every vendor renders a green **"Connected"** badge in `Vendors.tsx` |
| `backend/app/services/gap_service.py` | `v.category or "Third Party"` | `edge_builder` never writes `v.category`, so **every** vendor's category is "Third Party" |
| `backend/app/services/dashboard_service.py` | `label="Connected Vendors"` | Card names a count of *mentions* as *connections* |

To make it honest (no changes made — this is the direction):

- Rename the card to **"Vendors detected in code"**.
- Derive `connection_active` from provenance: the `sources` array on `SENT_TO` carries
  `{"origin": "code"}` vs `{"origin": "vendor"}`. Only `origin == "vendor"` means you
  actually talked to that vendor's API. That alone reduces 13 → 2 (Mixpanel, Firebase).
- Add a vendor allow-list/normalizer in `node_builder.py`, mirroring `validate_data_type`.

---

## 3. Security — fix these before anything else

### 3.1 There is a hardcoded auth backdoor

`backend/app/api/deps.py`:

```python
if token == "mock-token-123":
    return "mock-user-id"
```

`frontend/src/context/AuthContext.tsx` hands that exact token to anyone who submits the
login form (`// Bypassing real API call since DB is not connected`). Every route in
`router.py` marked "Protected" — dashboard, graph, gaps, compliance, github, scan — is
open to anyone on the network who sends `Authorization: Bearer mock-token-123`.

Your login screen is decoration. The real JWT machinery in `core/auth.py` is complete
and correct; it is simply bypassed.

### 3.2 …and `open-pr` is now a real, world-callable GitHub write

`github_service.open_compliance_pr()` is **no longer a stub** — it creates branches,
commits files and opens pull requests with your PAT. Combined with 3.1, `POST
/api/v1/gaps/{id}/open-pr` is an unauthenticated remote write to your GitHub account.
The roadmap explicitly warned about shipping 4.5 before 5.1; that has now happened.

### 3.3 The PR target falls back to a repo that isn't yours

```python
repo_full_name = gap.source_commit.repo if gap.source_commit else "nova-labs/checkout-service"
```

The reconciler **never** writes `source_commit_*` properties, so `gap.source_commit` is
`None` for *every real gap*. Every PR attempt therefore targets the hardcoded demo repo.

### 3.4 Minor

- `jwt_secret` default is `"dev-secret-do-not-use-in-prod"`.
- Webhook signature handling is correct — it fails closed outside development. Good.

---

## 4. Logic bugs

### 4.1 The dashboard reports "Graph unreachable" when the graph is healthy

`_QUERY_GRAPH_SUMMARY` (`dashboard_service.py`, duplicated verbatim in
`retrieval/queries.py:116`):

```cypher
MATCH (s:System)      WITH count(s) AS systems
MATCH (d:DataType)    WITH systems, count(d) AS data_types
MATCH (v:Vendor)      WITH systems, data_types, count(v) AS vendors
MATCH (c:DPDPClause)  WITH systems, data_types, vendors, count(c) AS clauses
```

Only the **first** aggregation is safe over an empty label. From the second `MATCH`
onward there is a grouping key, so zero rows in → zero rows out. **If any one of
DataType / Vendor / DPDPClause has no nodes, the entire query returns nothing**,
`_live_graph_summary()` returns `None`, and all five cards render "—  Graph unreachable".
`list_regulations()` degrades the same way.

This means a fresh instance, or an instance where you've scanned code but not yet loaded
the DPDP Act, is indistinguishable from a real outage. Use `OPTIONAL MATCH` or separate
`CALL {}` subqueries.

### 4.2 The dashboard's "Generate fix / Open PR" flow can never fire on real data

`useDashboard.ts`:

```ts
const selectedGap = gaps.find((g) => g.source_commit?.sha === selectedCommitSha)
```

- `selectedCommitSha` comes from `summary.recent_commits[0]` — which is one of three
  **hardcoded fake commits** (`a3f92c1`, `nova-labs/checkout-service`, author `dev1`).
- Real gaps have `source_commit === null` (see 3.3).

So `selectedGap` is always `undefined`, and `ComplianceImpactPanel` never shows a real
gap. The remediation flow is only reachable through mock data.

### 4.3 `ingest_stripe.py` cannot import

```python
from ingestion.vendors.mapper import map_fields_to_data_types   # line 16
```

There is no `mapper.py` in `ingestion/vendors/` — the files are `stripe_mapper.py`,
`mixpanel_mapper.py`, `firebase_auth_mapper.py`. `ImportError` on run.
`node_builder.py`'s docstring references the same non-existent module.
*The roadmap lists this as "already applied during the audit" — it is not fixed in this tree.*

### 4.4 The DPDP countdown points at the wrong date

`list_regulations()` uses `TRANCHE_3_DATE` (2027-05-13) as `next_commencement_date`.
But `legal/commencement.py` defines `TRANCHE_2_DATE = 2026-11-13`, which is the
genuinely *next* commencement — about six months sooner. Your own module contradicts
the number on screen.

### 4.5 The meta-verifier will reject almost every draft today

`reasoning/verifier.py` check 3 requires `clause.status == "in_force"`. As of August 2026
only Tranche 1 sections are in force; the substantive obligations commence 2026-11-13 and
2027-05-13. So most drafts return `verified: false` with reason *"clause status is
'not_yet_commenced'"*. That's arguably correct behaviour, but the UI has nowhere to say
"future obligation, not violation" — which is exactly the framing the roadmap recommends.
Also, the checks are chained with `elif`, so `reasons` never contains more than one entry.

### 4.6 Unbounded provenance growth

`edge_builder.py`: `ON MATCH SET r.sources = r.sources + [row.source_json]`, with no
dedupe. Scan the same repo five times and every `COLLECTS`/`SENT_TO` edge carries five
copies of every provenance record. On Aura Free this will bite.

### 4.7 One bad vendor record kills the whole batch

`graph_writer.write_classifier_output()` wraps `normalize_classifier_record()` in
`try/except ValueError` and skips bad rows. `write_vendor_fields()` calls
`normalize_vendor_field_record()` **with no try/except** — a single malformed row raises
and discards the entire ingestion run. Inconsistent with the file's own stated
fail-closed-per-item pattern.

### 4.8 Real PRs are hidden behind the mock flag, and lost on restart

`github_service.list_pull_requests()` starts with `_check_mocks()`, so with the default
`USE_MOCKS=False` it 503s — including when `_PRS` contains **real** PRs you just opened.
The gate is on the wrong side of the function. Separately, `_PRS` is an in-memory dict,
so real PRs disappear on every server restart.

### 4.9 `/graph` has no LIMIT

`_QUERY_NODES` and `_QUERY_EDGES` return every System/DataType/Vendor/DPDPClause node and
every COLLECTS/SENT_TO/GOVERNED_BY edge, unbounded. Once the full Act is loaded that is
easily several hundred nodes into a D3 canvas the roadmap says degrades past ~300.

### 4.10 `sys.path` grows on every request

`gap_service.py:347` (`list_regulations`) calls `sys.path.append(os.path.abspath(".."))`
with no guard — one new entry per request. The sibling call at line 232 does guard it.

---

## 5. What the frontend claims vs. what exists

With the default `USE_MOCKS=False`:

| Page | Backend source | What the user sees |
|---|---|---|
| Dashboard — 5 stat cards | **Real** Neo4j | Real, but "Connected Vendors" is mislabelled (§2) and all five read "Graph unreachable" whenever §4.1 trips |
| Dashboard — timeline | **Hardcoded fiction**, *not* behind `use_mocks` | "Mixpanel added · New analytics dependency detected in package.json", "3 documents affected" — always shown |
| Dashboard — commit feed | **Hardcoded fiction**, *not* behind `use_mocks` | `a3f92c1 feat: add Mixpanel analytics` by `dev1` on `nova-labs/checkout-service` — always shown |
| Compliance Graph | **Real** | Honest |
| Vendors | **Real** counts | Every row badged "Connected" and categorised "Third Party" (§2) |
| Regulations | **Real** | Honest except the countdown date (§4.4) |
| Policies | `_check_mocks()` | **503 red banner**; with mocks on: invented "96% Coverage" Privacy Policy |
| Audit Trail | `_check_mocks()` | **503 red banner**; with mocks on: "Priya S. (Legal Team)" merging "PR #241" |
| Repositories | `_check_mocks()` | **503 red banner**; with mocks on: four `nova-labs/*` repos that don't exist |
| Pull Requests | `_check_mocks()` | **503 red banner**, even for real PRs (§4.8) |
| Settings | none | Entirely fake — see below |

**Roadmap task 2.6 ("put every remaining mock behind `use_mocks`") is only half done.**
The two most visible fabrications on the app's front page — the reconciliation timeline
and the GitHub commit feed — are *not* gated, so there is no setting that turns them off.

### The scan button is unreachable in practice

"Scan Repository" only exists on `Repositories.tsx`. That page 503s by default; and with
mocks on, the four repos are `nova-labs/*`, which don't exist — clicking scan produces a
GitHub 404 and a failed scan. **There is currently no path in the UI to scan a real repo.**
The endpoint (`POST /api/v1/scan` + SSE) works; only the list feeding it is fake.

### `Settings.tsx` is a mockup

- `handleSave` is `setTimeout(…, 800)` that shows a success tick and persists nothing.
- Webhook secret field prefilled `whsec_xxxxxxxxxxxxxxx`.
- Neo4j URI field hardcoded `bolt://localhost:7687` — you are on Aura.
- "Test Connection" never calls `/api/v1/health`; the green "Connected" is simulated.
- Sidebar plan is `user?.plan || 'Growth plan'`, invented at signup.

---

## 6. Docstrings that now lie

The code moved ahead of its comments. Anyone reading this repo — a judge, a collaborator,
a future you — will be misled by all of these:

| File | Claim | Reality |
|---|---|---|
| `gap_service.py` header | "STATUS AS OF PHASE 3.3: still serving mock data… Neither is called yet" | `list_gaps()`/`get_gap()` query the graph |
| `gap_service.py` §banner | `# MOCK STORE — active today` | sits directly above the **real** implementation |
| `_gap_from_graph_row` | "Not called yet — reference implementation" | it is called |
| `graph_service.py` header | "Mock data below…" | there is no mock data below |
| `dashboard_service.py` header | only "Connected Vendors" is live | all five cards are live |
| `github_service.py` header | "open_compliance_pr() is stubbed… returns a mock PullRequest" | it writes to GitHub for real |
| `webhook.py` header | "trigger_reconciliation() is a stub that just logs"; refers to `app/intelligence/` | it queues a real background scan; that directory doesn't exist |
| `config.py` header | refers to `app/intelligence/` | doesn't exist |
| `README.md` tree | omits `backend/{graph,ingestion,…}` | those are 7 of the largest directories in the repo |

---

## 7. Config & repo hygiene

- **`docker-compose.yml` points at a local `neo4j:5` container**, a completely different
  database from your Aura instance — the compose stack will always look empty. It also
  passes no `GEMINI_API_KEY` to the backend, so scans inside Docker fail.
- **Root `.gitignore` ignores `Dockerfile`, `Dockerfile.*`, `docker-compose.yml`,
  `.dockerignore`.** The existing ones survive because they're already tracked, but any
  new one will silently never be added. There's also a malformed line: `.cache/-`.
- **Three `.env` files** (`backend/`, `frontend/`, `intelligence/`) — roadmap 1.5
  (consolidate to one) is still open, and it's what let the `NEO4J_USERNAME` mismatch hide.
- `backend/venv/` (a Windows venv) is in the working tree. Ignored by git and Docker, so
  it's just weight.
- `requirements.txt` carries `SQLAlchemy` and `psycopg2-binary`; there is no SQL anywhere.
- Two near-duplicate scripts: `graph/run_scan_and_write.py` and
  `graph/write_graph_from_scan.py`, the latter documenting a `--json` flag that
  `scan_remote_repo.py` doesn't have.
- `scan_repo_remote()` has **no** `max_file_bytes` cap; the local `scan_repo()` caps at
  200 KB. Roadmap 5.8, still open.

---

## 8. Roadmap status — what's actually done

More is finished than the roadmap or the docstrings suggest.

**Done:** 0.4 (`apply_schema.py`) · 1.3 (zero-byte files gone) · 1.4 (unreferenced
components gone) · 1.6 (webhook fails closed) · 1.7 (`.gitattributes`) · 2.1 (real
`/graph`) · 2.2 (real stat cards) · 2.3 (derived score) · 2.4 (real vendors) · 2.5 (real
regulations) · 3.1 (Gap vocabulary in `schema.py`) · 3.2 (reconciler writes `:Gap`) ·
3.3 (`gap_service` rewired) · 3.4 (drafter) · 3.5 (graph-grounded verifier) · 4.2
(`POST /scan`) · 4.3 (SSE) · 4.4 (scan button) · 4.6 (webhook → scan)

**Partly done:** 1.8 (README rewritten but its tree is stale) · 2.6 (mocks gated
*except* the two most visible ones) · 4.1 (`pyproject.toml` exists but was never
`pip install -e`'d — this is the root cause of §1)

**Not done, and now higher-risk than when written:** 1.1 (duplication moved, not
removed — and grew) · 1.2 · 1.5 · 1.9 · **4.5 shipped before 5.1**, producing exactly the
world-callable PR bot the roadmap warned about · 5.5 · 5.8 · 5.9

---

## 9. Suggested order

1. **Delete the `mock-token-123` bypass** in `deps.py` and make `AuthContext.login()` call `POST /auth/login`. Everything else is downstream of this. (~30 min)
2. **Fix `_QUERY_GRAPH_SUMMARY`** with `OPTIONAL MATCH` — you cannot trust any dashboard number until a legitimately empty label stops reading as an outage. (~20 min)
3. **Make the vendor card honest**: rename to "Vendors detected in code", set `connection_active` from `sources.origin`, populate `category`. (~1 h)
4. **Gate the dashboard timeline + commit feed** behind `use_mocks`, or delete them. Two fabricated panels on the front page is the biggest credibility risk in the app. (~30 min)
5. **Put a real repo in front of the scan button** — replace `list_repositories()`'s `nova-labs/*` with a text input, or read the repos from `:System` nodes. This is what makes the demo live. (~1 h)
6. **Write `source_commit_*` in the reconciler**, which unblocks the dashboard remediation panel (§4.2) and stops PRs targeting `nova-labs/checkout-service` (§3.3). (~1 h)
7. Fix `ingest_stripe.py`'s import, the Tranche-2 countdown, `list_pull_requests()`'s mock gate. (~30 min)
8. **After the demo:** `pip install -e ./intelligence`, delete the `backend/` copies, update the docstrings in §6.
