# Niam — Session Handoff

**Written:** 2026-08-30 · **Supersedes nothing** — read alongside the three docs in §2.

You are picking up mid-execution of a plan. Phases **S, A, B and C are done**; Phases **D–H
are not**. This document tells you what changed, why, what is still uncommitted, and what to
read before touching anything.

---

## 0. Read this first — three hard rules

1. **NEVER open, read, print, edit, move or delete any `.env` file.** Not `backend/.env`, not
   `frontend/.env`, not `intelligence/.env`, not under any circumstance — including while
   debugging a credential failure. `.env.example` (committed, no secrets) may be read for key
   *names* only. Anything needing an environment value is handed to Kamran as an exact
   `KEY=value` line for him to apply. If he reports a credential error, ask for the **error
   text**, never the file.
2. **Never write to the Aura (production) graph from a test.** Verification runs against a
   local Neo4j container. See §5.
3. **`intelligence/` and `backend/` contain byte-identical copies of seven directories.**
   Every change to one MUST be mirrored to the other. See §3.

---

## 1. What this project is

**Niam** (formerly "Nia", and "Continuum" in some leftover strings) — a DPDP Act 2023
compliance tool. It scans a GitHub repo for code that handles personal data, builds a Neo4j
graph of `System → DataType → Vendor` plus `DPDPClause` nodes, reconciles the two into
`:Gap` nodes, and drafts remediation text with Gemini.

Hackathon project. Two people. No real customers — this matters, because it justifies the
deliberate dummy-auth decision in §4.

**Stack:** React/Vite + Tailwind frontend · FastAPI backend · Neo4j AuraDB **Free** ·
Gemini (`gemini-3.1-flash-lite`) · GitHub API.

---

## 2. Documents to read, in order

All at the repo root, all current.

| # | File | What it gives you |
|---|---|---|
| 1 | **`CODEBASE_AUDIT.md`** | The full audit that started this. Every bug, with file:line. Sections 1–3 are essential background: the duplicate-tree problem, where "13 vendors" comes from, and the security findings. |
| 2 | **`ACTION_PLAN.md`** | The phased plan being executed. Decisions D1–D4 at the top are settled — **do not relitigate them**. Phases S/A/B/C are done; D onwards is your work. |
| 3 | **`KAMRAN_RUNBOOK.md`** | Every human-run step, as exact Windows PowerShell. **Read the six gotchas at the top before writing any command for him** — they encode failures that already cost real time. |
| 4 | `IMPLEMENTATION_ROADMAP.md` | Pre-existing roadmap. Partly superseded; audit §8 says what actually landed. |

---

## 3. Repository layout and the duplication trap

Kamran will give you **two** folders:

| Folder | What it is |
|---|---|
| `D:\niamm\Niam` | The product repo. Everything below lives here. |
| `D:\niamm-smoke-repo` | A throwaway public repo of synthetic fixtures, used as scan input. Never a source of truth — regenerate from `D:\niamm\Niam\smoke\fixtures\`. |

Inside `D:\niamm\Niam`:

```
backend/          FastAPI app (app/) + a COPY of the seven intelligence dirs
frontend/         React/Vite
intelligence/     the git-tracked original of those seven dirs
smoke/            test rig + diagnostics (gitignored)
```

### The trap

`intelligence/{demo,graph,ingestion,legal,reasoning,reconciliation,retrieval}` and
`backend/{same seven}` are **byte-identical clones**. Verified identical as of this handoff.

- `intelligence/` is the **git-tracked** copy (53 files). `backend/`'s copies are **untracked**.
- They exist because `backend/app/services/scan_service.py` imports `graph`, `ingestion` and
  `reconciliation` as top-level packages, and `nia-intelligence` was never
  `pip install -e`'d into `backend/venv`. Copying them made the imports resolve, because
  uvicorn runs with `backend/` as CWD.
- **Both copies are live in one process**: `scan_service.py` loads the `backend/` copy, while
  `gap_service.py:~232` does `sys.path.append("..")` and loads `intelligence.reasoning.drafter`.

**So: mirror every edit.** After changing either side, verify:

```bash
for d in demo graph ingestion legal reasoning reconciliation retrieval; do
  diff -rq --exclude=__pycache__ --exclude=.cache "intelligence/$d" "backend/$d"
done
```

Phase G1 removes the duplication (`pip install -e ./intelligence`, delete the `backend/`
copies). **Do not do this before the demo** — it is the highest-regression-risk cleanup here.

---

## 4. Settled decisions — do not reopen

| | Decision | Why it matters to you |
|---|---|---|
| **D1** | **Dummy auth stays.** `deps.py` accepts a fixed `mock-token-123`; the frontend never calls `/auth/login`. | This is deliberate, not unfinished. It is documented in `deps.py`'s docstring. Do **not** "fix" it by deleting the bypass without also wiring `AuthContext.tsx`. The guard that makes it safe is that it only works when `APP_ENV == "development"`. |
| **D2** | **Docker is parked; uvicorn only.** | `docker-compose.yml`'s backend service builds with `context: ./backend`, so `intelligence/` isn't in the build context and imports cannot resolve. Only the `neo4j` service is used, as the smoke database. |
| **D3** | **Rename Nia → Niam everywhere**, GitHub *org* excepted. | Phase F, not yet done. Three names are live: `NIA`, `nia`, `Continuum`. |
| **D4** | **`GITHUB_TOKEN` belongs to the `niacomplianceos` account.** | The scanner authenticates as that account, NOT as `gh`'s login (which was `kamran-rashid`). GitHub returns **404, not 403**, for repos a token cannot see — a permissions problem looks exactly like a typo. This cost a full debugging cycle. |

---

## 5. The verification rig (Phase S)

Nothing in this plan is verified against Aura. **AuraDB Free gives exactly one instance with
one database** (`neo4j`) — multi-database is a paid feature — and `MERGE (d:DataType {name})`
is keyed on name alone, so a test scan would merge straight into demo data.

So verification uses:

| Piece | What |
|---|---|
| Smoke DB | Local Neo4j container: `docker compose up -d neo4j` (only that service) |
| Redirect | Shell env vars override `.env` in PowerShell — **no file is written**. See runbook S3. |
| Smoke repo | `niacomplianceos/niam-smoke-repo` (public) — 6 fixture files, ~71 stage-1 candidates |
| Isolation | `--system niam-smoke` scopes writes; `gap_id` is system-scoped (see §6, S4) |
| Baseline | `smoke/graph_baseline.txt` — Aura counts, re-compared after every check |

Diagnostics in `smoke/` (all gitignored):

- `preflight.ps1` — checks venv, deps, leaked env vars, `gh`, Docker engine, `.env` key presence
- `check_repo_access.py` — diagnoses a scan 404 using **the scanner's** credential, not `gh`'s
- `dump_act.py` — diagnoses a DPDP parse failure by dumping each source's extracted text
- `fixtures/` — the six smoke-repo files, the source of truth for regenerating that repo

**Aura baseline at handoff:** `systems 1 · data_types 22 · vendors 13 · clauses 17 ·
in_force 2 · ungoverned 18`. Score 18%.

---

## 6. What changed, file by file

Working tree at handoff: **38 modified**, **2 new**, all **uncommitted** on top of `b3f20de`.

### Phase A — security & correctness

| File | Change |
|---|---|
| `backend/app/api/deps.py` | Bypass token now works **only** when `app_env == "development"`; otherwise rejected as an ordinary invalid token (generic message — doesn't confirm the token exists). Exports `DEV_BYPASS_TOKEN`, `dev_bypass_enabled()`. |
| `backend/app/main.py` | Loud startup warning when the bypass is active; info line when disabled. |
| `backend/app/core/config.py` | **New:** `github_dry_run` (default **true**), `pr_allowed_repos` + `pr_allowed_repos_list` (empty = deny all). |
| `backend/app/services/github_service.py` | Removed the `"nova-labs/checkout-service"` fallback → 400 when a gap has no `source_commit`. Added allow-list check (403) and a DRY_RUN path. Branch prefix `nia/` → `niam/`. `list_pull_requests()` no longer gated by `_check_mocks()`. |
| `*/retrieval/queries.py` | `GRAPH_SUMMARY` rewritten as six independent `COUNT {}` subqueries. The old chained `MATCH`es returned **zero rows** if any one label was empty, so an empty graph reported "Graph unreachable". `COUNT {}` needs Neo4j 5.5+ (`CALL () {}` would need 5.23+). |
| `backend/app/services/dashboard_service.py` | Imports `GRAPH_SUMMARY` instead of keeping a second copy. |
| `backend/app/services/gap_service.py` | Guarded the unguarded `sys.path.append`; countdown now picks the *next* commencement (Tranche 2, 13 Nov 2026) instead of hardcoding Tranche 3. |
| `*/graph/graph_writer.py` | `write_vendor_fields()` skips a malformed row instead of discarding the batch. |
| `*/reasoning/verifier.py` | Reports every failing check instead of `elif`-chaining. |
| `*/ingestion/vendors/ingest_stripe.py` | `ingestion.vendors.mapper` (does not exist) → `stripe_mapper`. |
| `*/legal/dpdp_source.py` | `DPDP_ACT_PDF_URLS` list; **validates section count at fetch time** so an unparseable source is rejected and the next tried. India Code is primary (bare-Act layout, 44/44); MeitY is the Gazette printing, which puts titles in the margin and parses to **0/44**. |
| `*/legal/load_dpdp_clauses.py` | Added `--url`. |
| `*/legal/dpdp_extractor.py` | Matches results **by section number, not list position**. Section 44 splits into TRAI/IT/RTI amendments; the old strict count check dropped both sections in the batch. |
| `*/ingestion/github/classifier.py` | Same fix, bigger payoff: results match by an echoed `"i"` index, and a **partial response is salvaged** — only the gaps get the review fallback. Was losing 8 of 71 candidates to one bad batch. |

### S4 — smoke isolation

| File | Change |
|---|---|
| `*/reconciliation/reconciler.py` | `gap_id` is now `gap-{system}-{data_type}-{vendor}`. Previously unscoped, so reconciling a second system `MERGE`d onto the first's gaps. **Genuine multi-tenancy bug**, not just a test concern. |
| `backend/app/api/v1/endpoints/scan.py` | `ScanRequest.system_name` (optional, validated `^[A-Za-z0-9._\-]{1,64}$`). |
| `backend/app/services/scan_service.py` | Threads `system_name` into `GraphWriter` and `Reconciler`; SSE `started` event names the system. |

### Phase C — honest UI

| File | Change |
|---|---|
| `backend/app/services/scoring.py` **(NEW)** | Single `compliance_score()`. The old `max(total, 1)` guard made an **empty graph report 100% compliant**. Now returns `None` → rendered `—`. Also removed `score = 73.0`, an invented default that looked like a measurement. |
| `backend/app/schemas/vendors.py` | `connection_active` **required** (was `= True` and never set → every vendor badged "Connected"). `category` now `str \| None`. Added `discovered_via`. |
| `backend/app/services/gap_service.py` | `_QUERY_VENDORS` returns `SENT_TO.sources`; `_vendor_is_connected()` reads `origin == "vendor"`. Policies return empty instead of 503. **Audit trail is now real**, built from `:Gap` nodes. |
| `backend/app/services/dashboard_service.py` | Card renamed **"Vendors detected"**. Timeline + commit feed **empty by default**; samples only under `USE_MOCKS`, flagged via new `sample_panels`. |
| `backend/app/schemas/dashboard.py` | Added `sample_panels`. |
| `backend/app/schemas/gaps.py` | `score: float \| None`. |
| `backend/app/services/github_service.py` | `list_repositories()` returns empty instead of 503. |
| `frontend/src/pages/Vendors.tsx` | "Detected in code" badge; `N detected · M connected` header. |
| `frontend/src/pages/Dashboard.tsx` | Sample panels hidden when empty, amber "Sample data" ribbon when present. |
| `frontend/src/components/repositories/ScanPanel.tsx` **(NEW)** | `owner/repo` + ref input driving `POST /scan` with a live SSE log. |
| `frontend/src/pages/Repositories.tsx` | Mounts `ScanPanel`; honest empty state. |
| `frontend/src/pages/Settings.tsx` | **338 → 104 lines.** Now a read-only `/health` panel. Deleted the fake save, the `whsec_xxx` field and the hardcoded `bolt://localhost:7687` box. |
| `frontend/src/context/AuthContext.tsx`, `Sidebar.tsx` | Removed the invented `plan` field. |
| `frontend/src/types/api.ts` | Mirrors the schema changes. |

---

## 7. State of the world at handoff

**Done:** Phase S (rig) · Phase A (A1–A4) · S4 · Phase B (env, PAT, graph) · Phase C (C1–C5).

**Verified:** Smoke Check S ✅ · Smoke Check A ✅ (401 without token, 200 with it in dev, 401
with `APP_ENV=production`, dashboard returns real numbers, empty graph returns zeros not an
outage, Aura untouched) · `npm run typecheck` ✅ after C1–C3.

**Not yet done:**

1. **`npm run typecheck` after C4/C5** — a component was added and `AuthContext.User` changed.
2. **Smoke Check C** — the nine-page walkthrough, twice (populated and wiped). Pass condition:
   **no number appears on the wiped database.** Vendors should read `6 detected · 0 connected`.
3. **Nothing is committed.** 38 modified + 2 new files sit on top of `b3f20de`.
4. **The smoke DB is empty** — it was wiped for the A3 regression test. Repopulate before C.
5. **Phases D–H.** Next real work is **E1** (write `source_commit_*` on `:Gap` nodes), which
   unblocks three things at once: the dashboard remediation panel, a real `open-pr` target, and
   a real commit feed.

**Known-open items, deliberately deferred:**

- `open-pr` returns **400 "Gap has no source repository"** for every gap, because the
  reconciler doesn't write `source_commit`. That is A2 working correctly. The DRY_RUN path
  can't be exercised until E1.
- `PR_ALLOWED_REPOS` and `GITHUB_DRY_RUN` need to be in `backend/.env` (Kamran's job).
- Aura may hold `:Gap` nodes with the old unscoped ids. `MATCH (g:Gap) WHERE NOT g.id STARTS
  WITH 'gap-nia-demo-system-' RETURN g.id` returned empty at handoff, so probably nothing.

---

## 8. How to work with Kamran

- He runs Windows PowerShell. **`curl` is `Invoke-WebRequest`** — always write `curl.exe`.
  **`VAR=x cmd` does nothing** — use `$env:VAR = "value"`. **Multi-line `if/else` pasted at an
  interactive prompt fails** — put conditionals on one line or in a `.ps1`.
- Give exact commands with the window and directory. The runbook's terminal table (T1–T5) is
  the convention; T1/T2/T5 talk to Aura and must never have `$env:NEO4J_*` set.
- He verifies each phase himself before moving on. Respect that gate — don't declare a phase
  done from inference. (I did once, and was rightly corrected.)
- When something fails, get the actual error text. Several bugs this session looked like one
  thing and were another: a "dead URL" was a transient 404 plus a layout mismatch; a "missing
  repo" was a token/owner mismatch; a "regex bug" was the wrong source PDF.
