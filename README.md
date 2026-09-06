# Niam

**DPDP readiness for engineering teams.** Niam scans a codebase for the places
it actually handles personal data, builds a graph of what is collected and
where it is sent, reconciles that against the Digital Personal Data Protection
Act 2023, and drafts the policy language each gap needs.

The framing matters, and it is deliberate. Most of the DPDP Act is **not in
force yet** — the substantive obligations commence **13 November 2026** and
**13 May 2027**. A tool that reported today's codebase as "non-compliant"
would be wrong. Niam reports *readiness*: what you collect, which obligations
will apply to it, when they start, and what is still ungoverned.

---

## What it does

1. **Scan** — reads a GitHub repository through the API and runs a two-stage
   pipeline over it: a zero-cost keyword pre-filter for recall, then a
   taxonomy-constrained Gemini classifier for precision. The taxonomy is fixed
   and validated in code, so the model cannot invent a data category.
2. **Graph** — writes `(System)-[:COLLECTS]->(DataType)-[:SENT_TO]->(Vendor)`
   into Neo4j, with file, line and resolved commit SHA kept as provenance on
   every edge.
3. **Legal** — parses the DPDP Act from the India Code publication into
   `:DPDPClause` nodes, each carrying its commencement date and status from a
   structured model of the Gazette notification.
4. **Reconcile** — derives `:Gap` nodes by comparing the two: data leaving the
   system with nothing governing it, data governed by obligations that have
   not commenced, data collected and ungoverned entirely.
5. **Remediate** — drafts the policy amendment each gap needs with Gemini, then
   runs three graph-grounded checks against the draft: the cited clause exists,
   a `GOVERNED_BY` edge really connects the gap's data type to it, and the
   clause's commencement status is known. A citation that fails is rejected.

Every number in the UI traces to a node, an edge, or a live API call. Where
there is no data, the interface says so rather than showing a placeholder.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind, D3 |
| Backend | FastAPI, Pydantic v2, Uvicorn |
| Graph | Neo4j (AuraDB) |
| Intelligence | Google Gemini (`google-genai`), PyGithub, pypdf |

**On the code scanner:** it is a keyword pre-filter feeding an LLM classifier,
not an AST parser. That is a deliberate trade — the pre-filter costs nothing
and catches broadly, the classifier resolves precision, and the fixed taxonomy
stops the model inventing labels. Real dataflow analysis is the right long-term
answer and is not what this does today.

---

## Repository layout

```text
Niam/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # auth, dashboard, graph, gaps, compliance,
│   │   │                       # github, scan (SSE), webhook, health
│   │   ├── core/               # settings, JWT, webhook signatures
│   │   ├── db/                 # Neo4j driver lifecycle
│   │   ├── schemas/            # Pydantic request/response models
│   │   └── services/           # dashboard, gap, graph, github, scan, scoring
│   └── {demo,graph,ingestion,legal,reasoning,reconciliation,retrieval}/
│                               # copy of the intelligence tree (see note)
│
├── intelligence/               # the analysis engine, an installable package
│   ├── graph/                  # schema, node/edge builders, Neo4j client, CLIs
│   ├── ingestion/
│   │   ├── github/             # scanner, diff parser, Gemini classifier
│   │   └── vendors/            # Stripe / Mixpanel / Firebase ingestion
│   ├── legal/                  # DPDP Act fetch, extraction, commencement model
│   ├── reasoning/              # remediation drafter, meta-verifier
│   ├── reconciliation/         # the gap engine
│   ├── retrieval/              # Cypher query layer + query CLI
│   └── demo/                   # seed scripts
│
├── frontend/src/
│   ├── components/             # graph canvas, dashboard panels, layout, ui
│   ├── hooks/                  # data fetching per page
│   ├── pages/                  # Dashboard, Graph, Vendors, Regulations,
│   │                           # Repositories, Policies, PRs, Audit, Settings
│   └── services/api/           # Axios client
│
└── smoke/                      # throwaway verification rig (gitignored)
```

> **One copy of the pipeline.** `backend/` used to hold a byte-identical copy of
> `intelligence/`, created before the package was installable so that
> `backend`-as-CWD could resolve the imports. Both copies ended up live in one
> process, and editing one had no effect on the other. The copies are deleted:
> `pip install -e ./intelligence` is now the only way those modules resolve,
> which is why that install step is not optional.

---

## Getting started

From nothing to a running app. Every command is given for **Windows
PowerShell** first and macOS/Linux second, because the two differ in more
places than they look.

### 0. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Python | 3.11 or newer | `python --version` |
| Node.js | 20 LTS or newer | `node --version` |
| Git | any recent | `git --version` |
| Docker Desktop | optional — only for a local Neo4j | `docker --version` |

You will also need three accounts, all free to start:

- **Neo4j AuraDB** — <https://console.neo4j.io>. The free tier is enough.
- **A GitHub token** — fine-grained, with *Contents* and *Pull requests*
  read/write, scoped to the repositories you intend to scan and nothing
  else. This token can open pull requests, so keep it narrow.
- **A Gemini API key** — <https://aistudio.google.com/apikey>. The
  classifier and the clause extractor both use it.

> Python 3.11 is a floor, not a suggestion: `intelligence/pyproject.toml`
> declares `requires-python = ">=3.11"` and the code uses `X | None`
> syntax throughout.

### 1. Clone

```powershell
git clone https://github.com/Nia-complianceOS/Niam.git
cd Niam
```

### 2. Get a graph running

**Option A — Neo4j Aura (what the deployed app uses).** Create a free
instance in the console. It shows the password exactly once, at creation
— save it then. You need three values: the connection URI
(`neo4j+s://xxxxxxxx.databases.neo4j.io`), the username (`neo4j`), and
that password.

> Aura Free **pauses after about three days idle** and is deleted after
> 30 days of inactivity. A paused instance makes every page read "Graph
> unreachable". Resume it from the console — and restart the API process
> afterwards, because the driver is cached for the life of the process
> and will not reconnect on its own.

**Option B — local Neo4j in Docker.** No account, nothing to pause:

```bash
docker compose up -d neo4j
```

Wait 30–45 seconds for Bolt to accept connections, then confirm at
<http://localhost:7474>. Your three values are `bolt://localhost:7687`,
`neo4j`, and `testpassword` (set in `docker-compose.yml` — it is a local
throwaway database, so the password is in the file on purpose).

### 3. Create the virtual environment

**Windows PowerShell:**

```powershell
python -m venv backend\venv
.\backend\venv\Scripts\Activate.ps1
```

If that fails with *"running scripts is disabled on this system"*:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\backend\venv\Scripts\Activate.ps1
```

`-Scope Process` applies to that window only and resets when you close it.

**macOS / Linux:**

```bash
python3 -m venv backend/venv
source backend/venv/bin/activate
```

Your prompt should now start with `(venv)`. Confirm you are on the right
interpreter before installing anything — this is the single most common
cause of "it worked yesterday":

```bash
python -c "import sys; print(sys.executable)"
```

It must print a path inside `backend/venv`.

### 4. Install dependencies

```bash
pip install -r backend/requirements.txt
pip install -e ./intelligence
```

The second line is not optional and not a convenience. `intelligence/`
is a real package (`niam-intelligence`), and the backend imports it as
`graph.*`, `legal.*`, `ingestion.*`, `reasoning.*`, `reconciliation.*`
and `retrieval.*`. Installing it editable (`-e`) means one copy on disk
resolves for the API, the CLIs and the tests alike. Without it every
import fails with `ModuleNotFoundError: No module named 'graph'`.

Check it took:

```bash
python -c "import graph, legal, reconciliation; print('intelligence ok')"
```

Then the frontend:

```bash
cd frontend
npm install
cd ..
```

### 5. Configure the environment

Create **`backend/.env`**. It is the single source of truth for both the
backend and the intelligence package — the CLIs read it too, so there is
only ever one file to keep straight. `backend/.env.example` lists every
key; these are the ones that matter:

```ini
# --- graph (required) ---
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# --- providers (required) ---
GEMINI_API_KEY=your-key
GITHUB_TOKEN=github_pat_...

# --- app ---
APP_ENV=development
JWT_SECRET=any-long-random-string-for-local-use

# --- the two pull-request guards (leave these alone at first) ---
GITHUB_DRY_RUN=true       # log the intended PR, create nothing
PR_ALLOWED_REPOS=         # comma-separated allow-list; empty denies all

# --- scan limits (optional; these are the defaults) ---
SCAN_RATE_LIMIT_PER_HOUR=10
SCAN_MAX_CONCURRENT=2

# --- optional, for the vendor connectors ---
GITHUB_WEBHOOK_SECRET=
MIXPANEL_TOKEN=
FIREBASE_SERVICE_ACCOUNT_PATH=
```

Both PR guards default to the safe value, so a fresh checkout cannot open
a pull request by accident. `GITHUB_DRY_RUN=true` means the app builds
the amendment and logs what it *would* push; `PR_ALLOWED_REPOS` empty
means no repository may be written to at all. Turn them off deliberately,
one at a time, when you actually want a real pull request.

`NEO4J_USER` is accepted as an alias for `NEO4J_USERNAME`, so either
spelling works.

**Frontend.** For local development nothing is needed — it defaults to
`http://localhost:8000/api/v1`. To point it elsewhere, create
`frontend/.env.local`:

```ini
VITE_API_BASE_URL=http://localhost:8001/api/v1
```

`VITE_*` variables are read at **build** time, not run time. Changing one
requires restarting the dev server (or rebuilding), not just a refresh.

### 6. Populate the graph

Run these from `intelligence/`, with the venv active, in this order. On a
fresh database all five are needed; afterwards only the last three.

```bash
cd intelligence

# 1. constraints and indexes — safe to re-run, all IF NOT EXISTS
python -m graph.apply_schema

# 2. fetch the DPDP Act 2023 and extract its clauses (~2 min, uses Gemini)
python -m legal.load_dpdp_clauses --yes

# 3. scan a repository into the graph
python -m graph.run_scan_and_write OWNER/REPO --system my-system --yes

# 4. read the company's own legal documents
python -m legal.load_policies --dir ../path/to/docs --yes
#    ...or straight from a repository:
python -m legal.load_policies --repo OWNER/REPO --yes

# 5. compare the three and write the gaps
python -m reconciliation.run_reconciliation --system my-system --yes
```

Then check what landed:

```bash
python -m retrieval.query_cli summary
```

**Step 4 is the one people skip, and skipping it fails quietly.**
Reconciliation compares three things: what the code collects, what the
Act requires, and what your published documents actually disclose. With
no `:PolicyDocument` in the graph the reconciler skips disclosure checks
entirely rather than reporting every data type as undisclosed — so a
missing load shows up as *no* "shared without disclosure" findings, not
an obvious error. The remediation flow also has no document to amend.

`--system` scopes everything to one `:System` node, and gap ids are
scoped by it. That is how a throwaway scan stays separable from real
data in the same database.

### 7. Run it

Two terminals, both from the repository root.

**Terminal 1 — API:**

```powershell
.\backend\venv\Scripts\Activate.ps1     # macOS/Linux: source backend/venv/bin/activate
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — UI:**

```bash
cd frontend
npm run dev
```

Frontend on <http://localhost:5173>, API on <http://localhost:8000>,
OpenAPI docs at <http://localhost:8000/docs>.

### 8. First run

1. Open <http://localhost:5173> and **sign up**. Authentication is real:
   the account is a `:User` node in the same Neo4j instance, with a
   hashed password, and every protected route needs the JWT it returns.
   There is no demo login.
2. **Dashboard** — the score and every stat card come from the graph. If
   they say "Graph unreachable", that is the truth, not a UI bug: check
   `NEO4J_URI` and that the instance is running.
3. **Compliance Gaps** — every finding, worst severity first. Pick one,
   read the detail panel, draft a fix.
4. **Repositories** — scan another repository straight from the UI;
   progress streams over SSE.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `ModuleNotFoundError: No module named 'graph'` | `pip install -e ./intelligence` was never run, or was run in a different venv. Check `python -c "import sys; print(sys.executable)"`. |
| Every page reads "Graph unreachable" | Aura is paused, or `NEO4J_URI` / credentials are wrong. After resuming Aura, **restart the API** — the driver is cached for the process's lifetime. |
| `running scripts is disabled on this system` | PowerShell execution policy. `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate. |
| `curl: The term 'curl' is not recognized` … or odd output | In PowerShell `curl` is an alias for `Invoke-WebRequest`. Use `curl.exe`. |
| Scan returns 404 for a repository you can see | `GITHUB_TOKEN` belongs to an account without access. GitHub returns 404, not 403, for a private repo a token cannot see — it looks like a missing repo. |
| Every API call fails from the browser but works in `/docs` | CORS. Add the frontend's exact origin to `CORS_ORIGINS`. |
| No "shared without disclosure" findings at all | Step 6.4 was skipped — no policy documents in the graph. |
| "You already have a scan running" | Not an error. One scan at a time per user; see `SCAN_RATE_LIMIT_PER_HOUR` and `SCAN_MAX_CONCURRENT`. |
| A pull request is "opened" but is not on GitHub | `GITHUB_DRY_RUN=true`, which is the default. |

---

## Running with Docker

```bash
docker compose up -d          # neo4j + backend + frontend
docker compose up -d neo4j    # just the database
```

The backend image builds from the repository root, not from `backend/`,
because it installs the `intelligence` package rather than relying on a
copy of it being present. Render builds the same `Dockerfile`, so the
container path is exercised by every deployment rather than rotting
quietly.

`docker compose up -d neo4j` on its own is also the local database used
for verification — a scan under a separate `:System` name can then be run
against it without touching a production graph.

Secrets are passed through from your shell rather than written into
`docker-compose.yml`:

```bash
GEMINI_API_KEY=... GITHUB_TOKEN=... docker compose up -d
```

---

## Verification

The project ships a throwaway rig so nothing is ever verified against the demo
graph. It is a local Neo4j container plus a synthetic fixture repository, and a
scan is scoped to its own `:System` node — `gap` ids are system-scoped, so a
test run cannot merge into real data. `smoke/` holds the diagnostics:
pre-flight checks, a scan-access diagnoser, an Act-parse dumper, and a
reconciler explainer.

```bash
cd intelligence && python -m pytest reconciliation/test_reconciler.py reasoning/test_verifier.py -q
cd backend     && python -m pytest tests -q
```

---

## Current state

Working end to end: repository scan, graph write with commit provenance, DPDP
clause loading with commencement status, ingestion of the company's own privacy
policy and terms, gap detection across both the Act and those documents,
remediation drafting, the graph-grounded verifier, SSE scan streaming, and a
pull-request path that is dry-run and allow-listed by default. Authentication is
real — JWTs against `:User` nodes with hashed passwords — and scans and pull
requests are stored in the graph, so both survive a restart.

Known limitations, stated plainly:

- **The Act's clause tagging is coarse.** Most DPDP sections are written about
  personal data as such rather than about categories of it, so most clauses
  attach generally rather than to a named data type. The API reports which
  basis a finding rests on rather than pretending to a precision it does not
  have.
- **The classifier is the weakest link in the chain.** A keyword pre-filter
  proposes candidates and Gemini classifies them against a fixed taxonomy. It
  drops what it is unsure of, so it under-reports rather than inventing
  findings — but a data flow it never sees produces no gap at all.
- **Disclosure findings need the documents loaded.** With no `:PolicyDocument`
  in the graph the disclosure half is skipped rather than reported as
  universally missing. That is the safer default and it is easy to mistake for
  "nothing found".
- **DPDP only.** GDPR, SOC 2 and HIPAA appear in the UI as explicitly disabled.
- **Not a legal opinion.** This finds and drafts; a person still decides. The
  remediation flow is built around that assumption, not around automating it
  away.

---

## License

Not yet licensed. All rights reserved.
