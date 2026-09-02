# Niam — Sequential Action Plan (v2)

Companion to `CODEBASE_AUDIT.md`. Ordered as requested:
**audit fixes → honest UI → rename → remaining roadmap.**

Phases alternate between **[CLAUDE]** (code changes in this repo) and **[KAMRAN]**
(Neo4j/Aura, GitHub, environment, renames only you can perform). Every phase ends with a
**Smoke Check** that you run and sign off manually, on a throwaway rig that cannot touch
your demo graph. Do not start a phase before the previous Smoke Check is signed.

> **Start at `KAMRAN_RUNBOOK.md` → Step 0 (Pre-flight).** It verifies the venv, deps, `gh`,
> the Docker engine and both GitHub identities in one block, catching every failure this
> project has actually hit before you spend time on a phase.
>
> **Every [KAMRAN] step and every Smoke Check is expanded into exact terminals,
> directories and PowerShell commands in `KAMRAN_RUNBOOK.md`.** This file is the *what
> and why*; that one is the *how*. Keep the runbook open while you work — it also covers
> three Windows-specific traps (`curl` is not curl, `VAR=x cmd` does nothing, and a
> leaked `$env:NEO4J_URI` writes smoke data into your demo graph).

---

## Standing rule 1 — the `.env` files are off-limits to Claude

> **Claude will never open, read, edit, print, copy or move any `.env` file** —
> not `backend/.env`, not `frontend/.env`, not `intelligence/.env`, under any
> circumstance, including while debugging a credential failure.
> `.env.example` (committed, no secrets) may be read for key *names* only.
>
> Any step needing an environment value becomes a **[KAMRAN]** task, handed to you as an
> exact `KEY=value` line. If a phase looks blocked on a credential, the correct move is to
> hand it to you — never to open the file. Same rule for `.env.local`, `.env.production`,
> Render/Vercel dashboard secrets, and the Aura credentials download.

## Standing rule 2 — checkpoints never run against the demo graph

> Every Smoke Check runs on the **throwaway rig built in Phase S**: a local Neo4j container,
> a junk GitHub repo, and a separate `System` name. Your Aura instance, your demo data and
> your real repos are never written to during verification. Nothing in this plan asks you to
> "just try it on the real thing and see".

---

## Decisions — resolved

> ### ✅ D1 CLOSED — 2026-09-02
> Done. The bypass is deleted from `deps.py`, `AuthContext.tsx` calls
> `POST /auth/login` and `/auth/signup` for real, `GET /auth/me` validates a
> stored token on load, and the login/signup pages surface the API's error
> instead of swallowing it. Phase I.0 is satisfied.
>
> ### ⚠️ D1 REOPENED — 2026-08-31
> D1 was agreed on the premise "a hackathon with no real customers". That
> premise no longer holds: this is a six-month hackathon judged on a
> production-grade result, and the project is being deployed and linked
> publicly. **Dummy auth cannot ship to a public URL** — see runbook §I.0
> for why, and for why closing it is an afternoon rather than a sprint
> (`core/auth.py` and `services/user_service.py` are both already real;
> only `AuthContext.tsx` needs wiring). Treat the text below as the
> historical local-development decision.

**D1 — Auth: dummy auth stays.** Agreed for a hackathon with no real customers. Two conditions
make that safe rather than sloppy, both cheap:

1. **The bypass must fail closed outside development.** Right now
   `if token == "mock-token-123"` works in *any* environment, including if you ever deploy
   `render.yaml` where `APP_ENV=production`. Claude will add a startup guard so the app
   refuses to boot with the bypass enabled unless `APP_ENV == "development"`.
2. **Your GitHub PAT is the actual asset at risk, not user data.** `open_compliance_pr()` makes
   real writes with your token through an unauthenticated endpoint. Dummy auth is fine; an
   unguarded PR bot is not. **A2 is therefore mandatory**, and the PAT rotation (B3) stays.

Keeping the login screen is fine — it demos well. It just gets an honest comment in the code
saying it is deliberate, not unfinished.

**D2 — uvicorn only. Docker is parked, and the `neo4j` service gets reused.** Probable reason
the backend container never worked: `docker-compose.yml` builds with `context: ./backend`, so
`intelligence/` is **not in the build context at all** — `from graph.graph_writer import …`
cannot resolve inside the image. Compose also passes no `GEMINI_API_KEY`, and points
`NEO4J_URI` at the empty local container rather than Aura, so even a successful build would
have shown an empty app. Not worth fixing before the demo. **But the `neo4j` service alone is
exactly the smoke database Phase S needs** — that part will work.

**D4 — Which GitHub account owns the repos you scan?** *(open — answer before Phase B3)*
`gh` is authenticated as `kamran-rashid`; `GITHUB_TOKEN` in `.env` belongs to `niacomplianceos`.
The scanner only ever uses `GITHUB_TOKEN`, and GitHub returns **404, not 403**, for a private
repo that token cannot see — so this looks like a missing repo, not a permissions problem. It
already cost a debugging cycle on the smoke repo, and Phase B1's real scan will hit it too if
the demo repos aren't visible to that same account. Settle it once: put the smoke repo (and
ideally the demo repos) under whichever account issues `GITHUB_TOKEN`, and rotate the PAT from
that account in B3. Runbook S2 has the decision table.

**D3 — Full rename, org excepted.** Repo, package, folder, system name, env var, display
strings — all renamed. The GitHub **org** (`Nia-complianceOS`) stays as-is for now; renaming
the **repo** (`NIA` → `Niam`) is a separate, easy settings toggle with automatic redirects,
and is included.

---

# Phase S — [BOTH] Build the throwaway verification rig

**Do this first.** Every later Smoke Check depends on it. ~40 min, once.

### S1 — [KAMRAN] A local Neo4j for testing
Use only the `neo4j` service from your existing compose file:
```bash
docker compose up -d neo4j        # or: docker run -d --name niam-smoke-neo4j \
                                  #   -p7474:7474 -p7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5
```
Confirm at `http://localhost:7474`. This is a completely separate database from Aura.

### S2 — [KAMRAN] A junk GitHub repo
**Done — fixtures written.** Six files live at `D:\niamm\Niam\smoke\fixtures\`, tuned to
`diff_parser.DEFAULT_SIGNALS` and dry-run verified at 71 stage-1 candidate lines: 12–16 data
types, 5–7 vendors, and one vendor-free file so the `ungoverned_collection` branch is
exercised. Create the repo **outside** `D:\niamm\Niam` (a nested empty repo breaks `git add .`
in the parent), copy the fixtures in, push. It must be readable by `GITHUB_TOKEN`'s account —
public, or owned by that account (see **D4**).
**Never point a Smoke Check at a repo you care about.** Full commands: runbook S2.

### S3 — [KAMRAN] Redirect a single command without touching any file
`python-dotenv` and `pydantic-settings` both let real environment variables win over `.env`,
so prefixing one command redirects everything to the smoke database — **no file is created,
edited or read**:

```bash
# one-off CLI run against the smoke DB
NEO4J_URI=bolt://localhost:7687 NEO4J_USERNAME=neo4j NEO4J_PASSWORD=testpassword \
  python -m graph.run_scan_and_write niacomplianceos/niam-smoke-repo --system niam-smoke --yes

# a second API instance on a different port, pointed at the smoke DB
NEO4J_URI=bolt://localhost:7687 NEO4J_USERNAME=neo4j NEO4J_PASSWORD=testpassword \
  uvicorn app.main:app --port 8001
```

Your real backend on `:8000` and your Aura graph keep running untouched throughout.

### S4 — [CLAUDE] Make smoke runs genuinely isolated
- **`gap_id` is not system-scoped.** `reconciler.py:118` builds `f"gap-{data_type}-{vendor}"`,
  so a smoke reconcile would `MERGE` onto your **demo** gaps if both ever share a database.
  Change it to `f"gap-{system}-{data_type}-{vendor}"`. This is a real multi-tenancy bug, not
  just a test concern — worth fixing regardless.
- Add an optional `system_name` to `ScanRequest` in `endpoints/scan.py` and pass it through
  `scan_service.run_scan()` to `GraphWriter`/`Reconciler` (both already accept it; only the
  HTTP layer hardcodes the default). This lets `POST /scan` be smoke-tested by name.
- Write `smoke/RUNBOOK.md` — the exact commands per phase, plus this teardown:
  ```cypher
  MATCH (g:Gap) WHERE g.id STARTS WITH 'gap-niam-smoke-' DETACH DELETE g;
  MATCH (s:System {name:'niam-smoke'}) DETACH DELETE s;
  MATCH (n) WHERE NOT (n)--() DETACH DELETE n;   // orphaned DataType/Vendor nodes
  ```
  *(On the local container you can also just `docker compose down -v` and start clean.)*

### S5 — [KAMRAN] Baseline your demo graph
```bash
cd intelligence && python -m retrieval.query_cli summary > smoke/graph_baseline.txt
```
Re-run this after any phase you're unsure about. **If the numbers moved and you only ran
Smoke Checks, something leaked — stop and find it.**

> ### ✅ Smoke Check S — sign off manually
> 1. `docker ps` shows the neo4j container running.
> 2. The `--system niam-smoke` scan writes into the **local** DB.
> 3. `query_cli summary` against **Aura** matches `graph_baseline.txt` exactly.
>
> - ✅ all three → Phase A.
> - ❌ Aura counts moved → an env override was missed. Find it before writing any code.
> - ❌ the neo4j container won't start → fall back to **dry-run only** verification
>   (`scan_remote_repo.py` and the `ingest_*.py` CLIs all default to no-write; `--write` and
>   `--yes` are opt-in). Slower to prove, but it still never touches Aura.

---

# PART 1 — Fix the audit items

## Phase A — [CLAUDE] Security and correctness

~2 h. Nothing downstream is trustworthy until A1–A3 land.

### A1 — Make the dummy auth deliberate and fail-closed
- Keep `mock-token-123` in `deps.py`, but **guard it**: if `settings.app_env != "development"`,
  the bypass is ignored and the app logs a loud warning at startup. Replace the current
  `# Bypass auth for local development/mock` comment with an explicit note that this is a
  hackathon decision, not an unfinished feature.
- Keep the login screen and `AuthContext`'s mock path. Add a code comment pointing at this
  plan's D1 so nobody "fixes" it by accident.
- **Bind to localhost.** Run `uvicorn --host 127.0.0.1`, never `0.0.0.0`, and do not tunnel
  (ngrok/Cloudflare) while the bypass is on. If you must demo remotely, turn `APP_ENV` to
  anything but `development` first — the guard then closes the door for you.

### A2 — Make `open-pr` safe *(mandatory, since auth won't protect it)*
- Delete the `"nova-labs/checkout-service"` fallback in `github_service.open_compliance_pr()`.
  If `gap.source_commit` is `None`, raise `HTTPException(400, "Gap has no source repository")`.
- Add a repo allow-list; refuse any repo not on it.
- Add a `DRY_RUN` path that logs the branch/commit/PR it *would* create, so Smoke Check A can
  exercise the whole flow without creating anything on GitHub.

### A3 — Stop the false "Graph unreachable"
`dashboard_service._QUERY_GRAPH_SUMMARY` and `retrieval/queries.py:GRAPH_SUMMARY` (identical
Cypher, duplicated) chain non-optional `MATCH`es — one empty label returns zero rows and every
card reads "Graph unreachable" while Neo4j is fine. Rewrite with `CALL {}` subqueries so each
count is independent, and collapse to one definition.

### A4 — Small correctness fixes
| Fix | File |
|---|---|
| Guard the unguarded `sys.path.append` | `gap_service.py:347` |
| `ingestion.vendors.mapper` → `stripe_mapper` (module doesn't exist → `ImportError`) | `ingest_stripe.py:16`, and `node_builder.py`'s docstring |
| Countdown uses `TRANCHE_3_DATE`; next commencement is `TRANCHE_2_DATE` (2026-11-13) | `gap_service.list_regulations()` |
| `write_vendor_fields()` needs `write_classifier_output()`'s `try/except ValueError` | `graph/graph_writer.py` |
| Move `_check_mocks()` out of `list_pull_requests()` so real PRs are listable | `github_service.py:83` |
| Collect all three verifier reasons instead of `elif`-chaining | `reasoning/verifier.py` |

> ### ✅ Smoke Check A — run on `:8001` against the smoke DB
> ```bash
> curl -si localhost:8001/api/v1/gaps | head -1                      # expect 401
> curl -si -H "Authorization: Bearer mock-token-123" \
>          localhost:8001/api/v1/gaps | head -1                       # expect 200 (dev)
> APP_ENV=production ... uvicorn app.main:app --port 8002             # expect refusal/warning
> curl -s localhost:8001/api/v1/dashboard/summary | grep -c unreachable   # expect 0
> ```
> Then, on a **wiped** smoke DB with zero `:DPDPClause` nodes, hit `/dashboard/summary` again —
> it must return real zeros, **not** "Graph unreachable". That is the A3 regression test and it
> is the one most likely to catch a bad fix.
> Manually confirm `POST /gaps/{id}/open-pr` in DRY_RUN logs its intent and creates nothing.
>
> - ✅ → Phase B. Run teardown, re-check `graph_baseline.txt`.
> - ❌ the production guard doesn't refuse → A1 incomplete; fix before deploying anywhere.
> - ❌ still "unreachable" on an empty DB → A3's rewrite is wrong, not your connection.

---

## Phase B — [KAMRAN] Environment, Neo4j and GitHub

~45 min. Claude cannot do any of this. **Claude will not touch `.env` — you apply these.**

### B1 — Confirm the demo graph is alive and populated
```bash
curl -s localhost:8000/api/v1/health          # expect neo4j_connected: true
cd intelligence && python -m retrieval.query_cli summary
```
- `clauses = 0` → `python -m legal.load_dpdp_clauses --yes`. Until this runs, the compliance
  score and Regulations page are meaningless.
- `systems = 0` → `python -m graph.apply_schema` then `python -m graph.run_scan_and_write OWNER/REPO --yes`.
- **Auth error again** → your Aura Free instance was paused or recreated (free instances pause
  when idle, and are **deleted after 30 days of inactivity** — Neo4j's own FAQ). Resume it in
  the console; if deleted, create a new
  one and update the credentials **yourself**. Paste the *error* into chat, never the file.

### B2 — Environment values to set yourself
| Key | Value | Why |
|---|---|---|
| `USE_MOCKS` | `false` | Confirm it isn't `true` |
| `APP_ENV` | `development` locally | A1's guard keys off this — production disables the auth bypass |
| `JWT_SECRET` | any long random string | Unused while auth is dummy; set it now so it isn't forgotten later |
| `GITHUB_WEBHOOK_SECRET` | a random string | Webhook only fails closed outside development |
| `NEO4J_USERNAME` | **leave exactly as-is** | Config now accepts both spellings — do not "tidy" this |
| `NIA_ENV_PATH` | **leave as-is until Phase F3** | Renamed there, with a fallback so nothing breaks |

### B3 — Rotate the GitHub PAT
The token has been reachable through an unauthenticated endpoint. Revoke it; issue a
fine-grained PAT scoped to **contents: read/write on the demo repos and `niam-smoke-repo` only**.

> ### ✅ Smoke Check B
> `query_cli summary` (Aura) prints four non-zero counts and `/health` says
> `neo4j_connected: true`. The new PAT works: run one **dry-run** scan
> (`scan_remote_repo.py`, no `--write`) against `niam-smoke-repo`.
> - ✅ → Phase C.
> - ❌ `vendors = 0` → fine, proceed. Phase C is what makes that honest.
> - ❌ Gemini errors → `python -m ingestion.github.smoke_test`. AI Studio keys start `AIza…`.
>   Fix it yourself; don't paste the key into chat.

---

# PART 2 — Make the UI tell the truth

## Phase C — [CLAUDE] Honest frontend

**Principle: every number on screen must trace to a node, an edge or a real API call.
Anything else gets deleted, not restyled.** ~3 h.

### C1 — Vendors stop pretending to be connected
- `schemas/vendors.py`: `connection_active` loses its `= True` default, becomes required.
- `list_vendors()`: derive it from provenance — connected **only** if the `SENT_TO` edge's
  `sources` array contains `"origin": "vendor"`. Code-detected vendors get
  `connection_active = False` and a **"Detected in code"** badge.
- Populate `v.category`, or delete the category line rather than printing "Third Party" for all.
- Dashboard card: **"Connected Vendors"** → **"Vendors detected"**, sub-label `N detected · M connected`.
- Add a vendor normalizer in `node_builder.py` mirroring `validate_data_type`, so
  `Stripe` / `stripe` / `Stripe API` collapse to one node.

**Expected outcome: 13 detected, ~2 connected (Mixpanel, Firebase). Stripe has never run — it
has no key. If the screen says that, it's correct. Do not backfill to make it look fuller.**

### C2 — Delete the fabricated dashboard panels
`get_dashboard_summary()` returns a hardcoded `timeline` and `recent_commits`
(`nova-labs/checkout-service`, `a3f92c1`, `dev1`) that are **not** behind `use_mocks` — no
setting turns them off. Delete both; render the five real cards plus an empty state until
Phase E provides real commit provenance. If the demo needs the visual, gate them behind
`_check_mocks()` **and** show a `SAMPLE DATA` ribbon. Never unlabelled.

### C3 — Fix the pages that 503
`list_policies()`, `list_audit_events()`, `list_repositories()` return 503 *"Not yet
implemented — see IMPLEMENTATION_ROADMAP.md Phase N"*, leaking a roadmap filename to the user
as a red error. Return `200` + an empty response so each page shows its existing `EmptyState`.
**Audit Trail is the exception worth building now** — it can be real from `:Gap.detected_at`,
`updated_at` and `pr_id`, instead of the invented "Priya S. (Legal Team)".

### C4 — Make the scan button reachable
Today "Scan Repository" only exists on a page that 503s, listing four `nova-labs/*` repos that
don't exist. Add an `owner/repo` + ref input calling `POST /api/v1/scan` directly.

### C5 — Settings: cut it back to what's real
`handleSave` is a `setTimeout(800)`; the webhook secret is prefilled `whsec_xxxxxxxxxxxxxxx`;
the Neo4j URI is hardcoded `bolt://localhost:7687` while you're on Aura; "Test Connection"
never calls the API. Keep **only** a read-only status panel driven by `GET /api/v1/health`.
**The Neo4j URI and webhook secret must never be editable from the UI** — those are `.env`
values and the UI has no business writing them. Also remove the invented `'Growth plan'` /
`'Free plan'` labels; there is no billing system.

> ### ✅ Smoke Check C — the manual walkthrough, on `:8001`
> Point the frontend at the smoke API for one run:
> `VITE_API_BASE_URL=http://localhost:8001/api/v1 npm run dev`
> *(a shell variable for one command — no `.env` edit)*
>
> Then, with `USE_MOCKS=false`, open all nine pages and for **every number on screen** say out
> loud which node or endpoint produced it. Do it twice: once with the smoke DB **populated**,
> once **wiped**.
> - ✅ every number traceable in both states → Phase D.
> - ❌ a page is empty on the wiped DB → **pass**. Empty is honest.
> - ❌ a page shows a number on the wiped DB → that number is hardcoded. Find it.
> - ❌ a page errors → re-run Smoke Check A; A1 or A3 regressed.

---

## Phase D — [KAMRAN] Sign-off walkthrough

~30 min, and the most valuable half-hour here. Do it on the **smoke** stack, then once on the
real one **read-only** (no scans, no PRs).

1. Demo the app to yourself end-to-end without once saying "ignore that, it's mock".
2. Decide what to **delete** rather than fill. Policies and Pull Requests have no real source
   until Phase H. Six honest screens beat nine with three fictions.
3. Confirm the vendor count moved from 13 to a detected/connected split.

> ### ✅ Smoke Check D
> You can narrate every screen truthfully, and `graph_baseline.txt` still matches Aura.
> - ✅ → Phase E.
> - ❌ one fabricated screen remains → name it, send it back to Phase C.

---

# PART 3 — Rename, then the roadmap remainder

## Phase E — [CLAUDE] Close the data-provenance gaps

These unlock real UI rather than hide fake UI. ~3 h.

- **E1 — Write `source_commit_*` on `:Gap` nodes** (`reconciler.py`'s `MERGE_GAP` writes
  neither `source_commit_*` nor `affected_documents`). This one change fixes three things:
  the dashboard's remediation panel becomes reachable (`useDashboard.ts` matches gaps by
  `source_commit.sha`), `open-pr` gets a real target repo, and the commit feed can become real.
- **E2 — Surface `severity` and `kind`** — the reconciler writes them; the `Gap` schema and
  `_gap_from_graph_row()` drop them.
- **E3 — `LIMIT` + pagination on `/graph`** — `_QUERY_NODES`/`_QUERY_EDGES` are unbounded; the
  D3 canvas degrades past ~300 nodes.
- **E4 — Dedupe `sources`** on `(file, line, commit_sha)` in `edge_builder.py` — every re-scan
  currently duplicates every provenance entry forever.
- **E5 — Cap remote blob size** in `scan_repo_remote()` to match `scan_repo()`'s 200 KB.
- **E6 — Frame not-yet-commenced clauses as "future obligation", not "violation"**, matching
  `verifier.py` check 3 and `commencement.py`. Most of the Act commences 2026-11-13 /
  2027-05-13, so nearly every draft verifies false today. Readiness-with-a-countdown is a
  **stronger** pitch than present-tense compliance, and it's what your own data supports.

> ### ✅ Smoke Check E — full pipeline, entirely on the rig
> ```bash
> NEO4J_URI=bolt://localhost:7687 ... \
>   python -m graph.run_scan_and_write niacomplianceos/niam-smoke-repo --system niam-smoke --yes
> NEO4J_URI=bolt://localhost:7687 ... \
>   python -m reconciliation.run_reconciliation --system niam-smoke --yes
> ```
> Then on `:8001`: gaps carry `source_commit_sha` → a gap appears on the dashboard →
> "Generate fix" produces a draft → **"Open PR" in DRY_RUN logs its intent against
> `niam-smoke-repo` and creates nothing.** Re-run the scan twice and confirm `sources` array
> lengths do **not** double (E4). Then run teardown.
> - ✅ → Phase F.
> - ❌ gaps have no commit sha → E1 incomplete; the dashboard panel stays unreachable.
> - ❌ scan hits rate limits → promote roadmap 5.6 (tarball fetch) ahead of Phase H.
> - ❌ demo gaps changed → S4's `gap_id` scoping didn't land. **Stop and fix it.**

---

## Phase F — [BOTH] Rename **Nia → Niam** (full scope)

Three names are live today: **NIA**, **nia**, and **Continuum** — a leftover product name in
the API title, four loggers, `continuum-bot` and `CONTINUUM AI`. All three collapse to Niam.

### F1 — [CLAUDE] Display strings and code identifiers (zero risk)
| Where | Change |
|---|---|
| `Sidebar.tsx:69`, `Login.tsx:39`, `Settings.tsx:119`, `index.html:6` | `NIA` → `Niam` |
| `main.py:30,31,50` | `Continuum API` / "Continuum Compliance Operating System" / `continuum-api` → Niam |
| loggers in `scan.py`, `webhook.py`, `dashboard_service.py`, `scan_service.py` | `continuum.*` → `niam.*` |
| `github_service.py:176` | `opened_by="continuum-bot"` → `niam-bot` |
| `github_service.py:109` | branch prefix `nia/remediation/` → `niam/remediation/` (new branches only) |
| `gap_service.py:438,446` | `actor="CONTINUUM AI"` → `Niam` *(these lines vanish if C3 replaced the mock audit trail)* |
| `config.py:42` | `app_name` default `"NIA Backend"` → `"Niam Backend"` |
| `localStorage` keys | `nia_user` → `niam_user`, `nia_sidebar_collapsed` → `niam_sidebar_collapsed` (logs sessions out once — do it in the same commit) |
| `.gitignore`, `.dockerignore` | `nia_env/` → `niam_env/` |
| `README.md`, `CODEBASE_AUDIT.md`, `ACTION_PLAN.md` | headings and prose |

### F2 — [CLAUDE] Package and env-var rename (needs a reinstall / a shell change)
- **`pyproject.toml`**: `name = "nia-intelligence"` → `"niam-intelligence"`.
  Requires `pip uninstall nia-intelligence && pip install -e ./intelligence` — **sequence this
  with Phase G1**, which does that install anyway. The importable package names
  (`graph`, `ingestion`, …) do not change.
- **`NIA_ENV_PATH` → `NIAM_ENV_PATH`**, read in 8+ modules. Claude will write it as
  `os.getenv("NIAM_ENV_PATH") or os.getenv("NIA_ENV_PATH") or find_dotenv(...)` — the old name
  keeps working, so **nothing breaks whether or not you update `.env`**. Updating that line in
  `.env` is yours to do, whenever you like. Claude will not open the file to check.

### F3 — [CLAUDE, gated on your go-ahead] The graph key
**`DEFAULT_SYSTEM_NAME = "nia-demo-system"`** (`graph/schema.py:70`) is a **graph key**, not a
label. `MERGE (s:System {name: …})` on a new value creates a **second System node**, orphaning
every existing `COLLECTS` edge, and `clauses_for_system()` returns nothing for the new name
until you re-scan. Pick one:
1. **Migrate** *(you, in the Aura console, before the code change)*:
   ```cypher
   MATCH (s:System {name:'nia-demo-system'}) SET s.name = 'niam-demo-system'
   ```
   Then Claude changes the constant. No re-scan needed.
2. **Re-scan** — change the constant, delete the old `:System`, run one fresh scan.

**Rehearse route 1 on the smoke DB first** (rename `niam-smoke` → `niam-smoke-2`, confirm the
API still returns gaps). Do neither before S5's baseline exists.

### F4 — [KAMRAN] Surfaces only you can reach
| Surface | Action | Risk |
|---|---|---|
| **GitHub repo** `NIA` → `Niam` | Settings → rename, then `git remote set-url origin …` | Low — GitHub auto-redirects the old URL |
| **GitHub org** `Nia-complianceOS` | **Deferred** per D3 | — |
| **Local folder** `D:\niamm\Niam` → `D:\niamm\Niam` | Rename **after the demo** | ⚠️ Breaks `.vscode/settings.json`'s hardcoded `D:\niamm\Niam\backend\venv\Scripts\python.exe` **and your venv's absolute paths — you must delete and recreate `backend/venv` afterwards.** Do this in the same sitting as G1 |
| **`package.json`** `NIA-frontend` → `niam-frontend` | Claude edits; you run `npm install` to regenerate the lockfile | Low |
| **`backend/.env`** `APP_NAME=` | Yours to edit, or leave | Cosmetic. Claude will not touch this file |
| **Aura instance name** | Rename in the console | Cosmetic — **does not change the URI or password**, so no `.env` edit |
| **`render.yaml`** `nia-backend`, `nia-frontend.vercel.app` | Update if you ever deploy | Low |

> ### ✅ Smoke Check F
> ```bash
> grep -ri "\bnia\b\|continuum" --exclude-dir=venv --exclude-dir=node_modules \
>   --exclude-dir=.git --exclude=".env" .
> ```
> Expect only: the `NIA_ENV_PATH` backward-compat fallback, and paths you haven't renamed yet.
> Then rebuild the frontend and re-run Smoke Check C's walkthrough on the smoke stack — the
> `localStorage` rename means you should be logged out once; log back in and confirm the
> sidebar reads **Niam**.
> - ✅ → Phase G.
> - ❌ the app breaks after F3 → you now have two `:System` nodes. Run the migration Cypher, or
>   re-scan. **This is what S5's baseline is for.**
> - ❌ `ModuleNotFoundError` after F2 → the editable reinstall didn't take. Do G1 now.

---

## Phase G — [CLAUDE] Structural cleanup

**After the demo.** Highest-value cleanup, highest same-day regression risk. ~2 h.

- **G1 — Kill the duplicate tree.** `pip install -e ./intelligence` into `backend/venv`, then
  delete `backend/{demo,graph,ingestion,legal,reasoning,reconciliation,retrieval}`. Those seven
  directories are **byte-identical clones** of `intelligence/` and are **untracked by git** —
  `intelligence/` is the only committed copy (53 files vs 0). Combine with F2's package rename.
- **G2 — Unify the imports.** `scan_service.py` loads the `backend/` copy while
  `gap_service.py:232` loads the `intelligence/` copy via `sys.path.append("..")`. **Both are
  live in one process today.** After G1, make both use plain `reasoning.drafter` /
  `reconciliation.reconciler` and delete every `sys.path` hack.
- **G3 — Fix the nine lying docstrings** (audit §6): `gap_service.py`'s
  `# MOCK STORE — active today` banner sits directly above the real implementation;
  `github_service.py` still calls `open_compliance_pr` "stubbed" while it writes to GitHub.
- **G4 — Docker, per D2.** Keep the `neo4j` service (it's your smoke database). Move the
  backend/frontend services into `docker-compose.unsupported.yml` with a header explaining the
  build-context problem, or delete them. Either way, say so in the README so nobody loses an
  afternoon to it again.
- **G5 — Repo hygiene:** remove `Dockerfile` / `docker-compose.yml` / `.dockerignore` from the
  root `.gitignore` (new ones would silently never be committed); fix the malformed `.cache/-`
  line; drop unused `SQLAlchemy` + `psycopg2-binary`; delete `backend/venv/` from the working
  tree; merge the near-duplicate `run_scan_and_write.py` / `write_graph_from_scan.py`; update
  the README tree.
- **G6 — One `.env`** *(roadmap 1.5)* — **[KAMRAN] executes.** Claude changes the *code* so
  both trees resolve a single root `.env` via `find_dotenv()`, then hands you the move.
  **Claude does not move, merge, read or delete any `.env` file.**

> ### ✅ Smoke Check G
> With `backend/{graph,ingestion,…}` deleted, re-run **Smoke Check E in full** on the rig. It
> is the only check that exercises every import path at once, which is exactly what G1/G2 put
> at risk.
> - ✅ → Phase H.
> - ❌ `ModuleNotFoundError` → the editable install didn't take. Restore with
>   `cp -r intelligence/graph backend/` etc. — nothing is lost, they're identical clones — then
>   retry the install.

---

## Phase H — [CLAUDE + KAMRAN] Remaining roadmap

Only after Smoke Check G. Re-prioritise here rather than following the original order —
several items already landed (audit §8), and Phase E absorbed 5.5 and 5.8.

| # | Item | Owner | Note |
|---|---|---|---|
| 5.2 | Persistence: `repositories`, `scan_runs`, `compliance_prs`, `audit_events` | Claude | Ends `_PRS`-in-memory losing real PRs on restart; gives Policies/Audit Trail a real source. **Reconcile the two conflicting DDLs in your docs first** |
| 5.3 | Generate `types/api.ts` from `/openapi.json` | Claude | Kills contract drift permanently |
| 5.4 | Unit tests: `parse_unified_diff`, `normalize_*`, `status_for_section`, the three vendor mappers | Claude | `status_for_section`'s tranche logic will break silently otherwise |
| 5.6 | Tarball / shallow clone instead of per-blob fetch | Claude | ~500 requests → 1. Promote if Smoke Check E hit rate limits |
| 6.x | Privacy-policy ingestion | Both | Coverage gap → *disclosure* gap. Changes the product definition |
| 6.x | Ollama adapter, or delete the "runs air-gapped" claim | Kamran decides | The claim is currently false |
| — | Documentation corrections table (roadmap §Documentation) | Claude | Settle on **one** graph schema across the three docs |

---

## How this plan adapts

1. **Every Smoke Check is a command with an expected output, run by you, on the rig.** Never a
   judgement call, and never against the demo graph.
2. **A failed check inserts work, it does not defer it.** Fix, re-run the check, then continue.
3. **After every check, re-compare `query_cli summary` on Aura against `graph_baseline.txt`.**
   If it moved during verification, an env override leaked — find it before writing more code.
4. **Re-scope after Phase D.** Once every screen is honest you'll know which pages are worth
   building versus deleting. Re-cut E–H against that rather than following it blindly.
5. **Anything blocked on a credential is a [KAMRAN] task by construction** — a consequence of
   Standing rule 1, not a workaround for it.
6. **If a phase runs long, stop at its Smoke Check** rather than half-finishing the next one.
   Every signed check is a state you can demo from.

## Critical path to a demo you can defend

```
S ──► A1,A2,A3 ──► B1,B2 ──► C1,C2,C3 ──► D ──► E1 ──► F1
40 m    2 h          45 m      3 h         30 m   1 h    30 m
                                                       ≈ 8.5 h

rig    auth safe     real       no          sign   real    Niam
built  + no false    graph      fiction     off    gaps    everywhere
       outage
```

F2–F4 and G–H are post-demo. Nothing in them makes the demo more true; S through F1 do.


---

# Phase I — [BOTH] Deployment

**Scope change, 2026-08-31.** Six-month hackathon, production-grade
expectation, public link. Deployment moves from "post-hackathon, probably
not" to a phase of its own. Full step-by-step in `KAMRAN_RUNBOOK.md` §I.

| # | Item | Owner | Note |
|---|---|---|---|
| I.0 | ✅ **DONE 2026-09-02.** Close D1. Wire `AuthContext.login()`/`signup()` to `POST /auth/login` and `/auth/signup`, store the returned JWT, delete the bypass from `deps.py` | Claude | **Blocks everything else.** `core/auth.py` (JWT) and `user_service.py` (`:User` nodes in Neo4j, hashed passwords) are already real — this is a frontend wiring job, not a backend build |
| I.1 | Move `Dockerfile` to the repo root; install `intelligence/` rather than relying on `backend/`'s copies; bind `${PORT}` | Claude | Today's Dockerfile works only because the duplicated tree exists. **G1 deletes those copies and breaks every deployed build** — do I.1 before G1, or ship a broken image |
| I.2 | Backend on **Render** (Docker, long-lived process) | Kamran | Not Vercel and not GitHub Pages: `BackgroundTasks` + in-memory `SCANS` + a minutes-long SSE stream cannot survive serverless. Runbook §I.1 has the three specific failure modes |
| I.3 | Frontend on **Vercel** (root `frontend`, preset Vite) | Kamran | `VITE_API_BASE_URL` is baked in at build time |
| I.4 | `CORS_ORIGINS` on Render ← the Vercel URL | Kamran | The classic first-deploy failure |
| I.5 | Persistence for `SCANS` and `_PRS` (roadmap 5.2) | Claude | In-memory today: scan state and opened PRs vanish on restart and cannot work across two instances. Survivable for a demo, not for "production-grade" |
| I.6 | Rate-limit `POST /scan` | Claude | Publicly reachable, and every call spends Gemini quota and GitHub API budget |
| I.7 | Aura capacity | Kamran | Free tier pauses when idle and is **deleted after 30 days of inactivity** — a paused instance renders the whole site "Graph unreachable" |
| I.8 | Rotate `GITHUB_TOKEN` after the first deploy | Kamran | It will have passed through build logs |

**Sequencing:** I.0 → I.1 → I.2/I.3/I.4 → I.5–I.8. I.1 must land **before**
Phase G1, or the first cloud build after the cleanup fails with
`ModuleNotFoundError: No module named 'graph'` — in CI, not on your machine.
