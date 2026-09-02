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

> **Note on the duplicated tree.** `backend/{graph,ingestion,legal,…}` is a copy
> of `intelligence/`, created before the package was installable so that
> `backend`-as-CWD could resolve the imports. `intelligence/` is now installed
> with `pip install -e ./intelligence`, which makes the copies redundant;
> removing them is tracked as a cleanup task. Until then, **any change to one
> must be mirrored to the other.**

---

## Getting started

**Prerequisites:** Python 3.11+, Node.js 20 LTS, a Neo4j instance (AuraDB free
tier is enough), a GitHub token, and a Gemini API key.

### Backend and intelligence

```bash
python -m venv backend/venv
backend\venv\Scripts\activate      # macOS/Linux: source backend/venv/bin/activate

pip install -r backend/requirements.txt
pip install -e ./intelligence
```

### Environment

Create `backend/.env` — it is the single source of truth for both the backend
and the intelligence package. See `backend/.env.example` for the full list:

```
NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD
GITHUB_TOKEN            # fine-grained, contents + PR read/write, demo repos only
GEMINI_API_KEY
APP_ENV=development
JWT_SECRET
GITHUB_WEBHOOK_SECRET
GITHUB_DRY_RUN=true     # log intended PRs instead of opening them
PR_ALLOWED_REPOS=       # comma-separated allow-list; empty means no repo
```

Both PR guards default to the safe value, so a fresh checkout cannot open a
pull request by accident.

### Load the Act and scan a repository

```bash
cd intelligence
python -m graph.apply_schema
python -m legal.load_dpdp_clauses --yes
python -m graph.run_scan_and_write OWNER/REPO --system my-system --yes
python -m reconciliation.run_reconciliation --system my-system --yes
python -m retrieval.query_cli summary
```

### Run it

```bash
cd backend  && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
cd frontend && npm install && npm run dev
```

Frontend on `:5173`, API on `:8000`, OpenAPI docs at `/docs`.

You can also scan straight from the UI: the Repositories page takes an
`owner/repo`, and the scan streams progress over SSE.

---

## Verification

The project ships a throwaway rig so nothing is ever verified against the demo
graph. It is a local Neo4j container plus a synthetic fixture repository, and a
scan is scoped to its own `:System` node — `gap` ids are system-scoped, so a
test run cannot merge into real data. `smoke/` holds the diagnostics:
pre-flight checks, a scan-access diagnoser, an Act-parse dumper, and a
reconciler explainer.

```bash
python -m pytest reconciliation/test_reconciler.py reasoning/test_verifier.py -q
```

---

## Current state

Working end to end: repository scan, graph write with commit provenance, DPDP
clause loading with commencement status, gap detection, remediation drafting,
the graph-grounded verifier, SSE scan streaming, and a pull-request path that
is dry-run and allow-listed by default.

Known limitations, stated plainly:

- **Authentication is a development bypass.** Real JWT machinery and a Neo4j
  user store both exist; the frontend does not yet call them. The bypass is
  refused unless `APP_ENV=development`. This must be closed before any public
  deployment.
- **Scan state is in memory.** Scan progress and opened PRs are held in process
  dictionaries and do not survive a restart or a second instance.
- **The Act's clause tagging is coarse.** Most DPDP sections are written about
  personal data as such rather than about categories of it, so most clauses
  attach generally rather than to a named data type. The API reports which
  basis a finding rests on rather than pretending to a precision it does not
  have.
- **DPDP only.** GDPR, SOC 2 and HIPAA appear in the UI as explicitly disabled.

---

## License

Not yet licensed. All rights reserved.
