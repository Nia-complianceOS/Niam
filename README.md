# Niam

**Automated DPDP Act 2023 compliance auditing & remediation for engineering and legal teams.** 

Niam continuously scans codebases for personal data flows, maps AST data paths and external processor sinks, constructs a graph of what is collected and where it travels, reconciles flows against the **Digital Personal Data Protection Act, 2023 (India)**, and drafts the exact statutory policy amendments each finding requires.

> **Readiness over artificial compliance:** Most substantive obligations of the DPDP Act commence on **13 November 2026** and **13 May 2027**. A platform reporting an active codebase as "non-compliant" today would be legally inaccurate. Niam reports **statutory readiness**: what personal data you collect, which statutory clauses govern it, when those provisions take effect, and which flows currently lack legal disclosure or consent boundaries.

---

## Key Capabilities

1. **Static Ingestion & Classification Pipeline**
   - Ingests repositories via the GitHub REST API without cloning large history trees.
   - Two-stage processing pipeline: high-recall keyword pre-filter combined with a taxonomy-constrained Google Gemini classifier.
   - Enforces a fixed data taxonomy in code to eliminate model hallucination of arbitrary PII labels.

2. **Compliance Knowledge Graph (Neo4j)**
   - Persists a 4-lane compliance ontology: `(:System)-[:COLLECTS]->(:DataType)-[:SENT_TO]->(:Vendor)`.
   - Attaches strict provenance metadata to every edge: file path, line numbers, and resolved commit SHA.
   - Self-healing connection driver automatically reconnects after AuraDB idle timeouts or network interruptions.

3. **Statutory Framework Engine**
   - Parses the DPDP Act 2023 directly from India Code gazette publications into structured `:DPDPClause` nodes.
   - Models commencement dates and enforceability statuses directly in the knowledge graph.

4. **Continuous Reconciliation Engine**
   - Flags three distinct gap archetypes:
     - **Undisclosed Transfers**: Personal data transmitted to third-party processors without policy disclosure.
     - **Uncommenced Obligations**: Data governed by statutory requirements whose enforcement schedule is pending.
     - **Ungoverned Collections**: Personal data ingested with no recorded policy schedule or legal basis.

5. **Remediation Drafter & Meta-Verifier**
   - Drafts targeted policy amendments using Gemini, constrained by existing document formats.
   - Enforces graph-grounded validation: verifies that cited statutory clauses exist, that a valid `GOVERNED_BY` edge connects to the data type, and that commencement status is validated.
   - Prose-first review mode formats amendments for legal counsel inspection prior to opening GitHub Pull Requests.
   - Strict dry-run and allow-list safety gates prevent unintended upstream repository writes.

6. **"The Regulatory Ledger" Interface**
   - Built on an institutional, editorial aesthetic tailored for auditors, compliance officers, and engineers.
   - Uses *Newsreader* serif typography for statutory assertions, *Inter* for operational metrics, and *monospace* for AST code provenance and cryptographic hashes.
   - Zero invented stats: eliminates arbitrary trending indicators, presenting only verifiable point-in-time metrics.

7. **Forensic Audit Trail**
   - Immutable chronological ledger capturing every scan event, processor detection, and PR draft with actor attribution.
   - Secured real-time scan telemetry stream using single-use, short-lived SSE ticket tokens.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite 5, TypeScript 5, Tailwind CSS, Framer Motion, D3.js, Lucide Icons |
| **Backend API** | FastAPI, Pydantic v2, Uvicorn, Python 3.11+ |
| **Database & Knowledge Layer** | **Neo4j** (Graph knowledge layer) & **Supabase** (PostgreSQL for Auth, Scan history, Audit logs) |
| **Intelligence Engine** | Google Gemini (`google-genai`), PyGithub, pypdf |
| **Containerization** | Docker, Docker Compose |

---

## Repository Structure

```text
Niam/
├── backend/
│   ├── app/
│   │   ├── api/                # API router & dependencies
│   │   │   └── v1/endpoints/   # auth, dashboard, graph, gaps, compliance,
│   │   │                       # github, scan (SSE stream), webhook, health
│   │   ├── core/               # App configuration, JWT handling, security
│   │   ├── db/                 # Self-healing Neo4j driver & Supabase clients
│   │   ├── schemas/            # Pydantic request/response validation models
│   │   └── services/           # Business logic: dashboard, gaps, graph, scan, scoring
│   ├── requirements.txt
│   └── venv/                   # Python virtual environment
│
├── intelligence/               # Core analysis engine (installable package: niam-intelligence)
│   ├── graph/                  # Neo4j schema definitions, node/edge builders, migration CLI
│   ├── ingestion/
│   │   ├── github/             # Repository scanner, diff parser, Gemini classifier
│   │   └── vendors/            # Third-party processor connectors (Stripe, Mixpanel, Firebase)
│   ├── legal/                  # DPDP Act extraction, clause loaders, commencement schedules
│   ├── reasoning/              # Remediation drafter & graph-grounded verifier
│   ├── reconciliation/         # Compliance gap discovery engine
│   ├── retrieval/              # Cypher query layer and CLI diagnostic tools
│   ├── demo/                   # Graph seeding fixtures
│   └── pyproject.toml
│
├── frontend/
│   ├── src/
│   │   ├── components/         # Compliance graph canvas, gap queues, layout, modals
│   │   ├── hooks/              # Dedicated data fetching hooks
│   │   ├── pages/              # Dashboard, Graph, Gaps, PRs, Vendors, Regulations,
│   │   │                       # Policies, Repositories, Audit Trail, Settings
│   │   ├── services/api/       # Axios API client & SSE ticket token subscriber
│   │   ├── styles/             # Global CSS & "The Regulatory Ledger" theme tokens
│   │   └── types/              # TypeScript API contract interfaces
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml          # Container configuration for Neo4j and full-stack services
└── Dockerfile                  # Multi-stage production container build
```

> **Single Source of Truth for Intelligence Modules:**  
> The backend does not carry duplicate copies of the analysis engine. The `intelligence/` directory is installed into the virtual environment as an editable package (`pip install -e ./intelligence`). All API routes and background tasks import directly from `graph.*`, `legal.*`, `ingestion.*`, `reasoning.*`, `reconciliation.*`, and `retrieval.*`.

---

## Getting Started

Follow this guide to run Niam locally. Instructions are provided for both **Windows PowerShell** and **macOS / Linux**.

### 0. Prerequisites

| Dependency | Minimum Version | Verification Command |
|---|---|---|
| **Python** | 3.11 or newer | `python --version` |
| **Node.js** | 20 LTS or newer | `node --version` |
| **Git** | Recent version | `git --version` |
| **Docker Desktop** | Optional (for local Neo4j) | `docker --version` |

You will also need credentials for the following services (free tiers are sufficient):
- **Neo4j AuraDB** (<https://console.neo4j.io>) or a local Docker Neo4j instance.
- **Supabase** (<https://supabase.com>) for relational user accounts and scan telemetry.
- **Google Gemini API Key** (<https://aistudio.google.com/apikey>) for taxonomy classification and policy drafting.
- **GitHub Personal Access Token** (fine-grained token with `Contents` and `Pull requests` read/write access scoped to your target repositories).

### 1. Clone the Repository

```bash
git clone https://github.com/Nia-complianceOS/Niam.git
cd Niam
```

### 2. Configure the Graph Database

#### Option A: Neo4j AuraDB (Cloud)
1. Create a free Neo4j AuraDB instance in the Neo4j Console.
2. Record the **Connection URI** (`neo4j+s://xxxxxxxx.databases.neo4j.io`), username (`neo4j`), and generated password.
3. If the instance pauses after inactivity, resume it in the console. The Niam backend includes self-healing connectivity checks and will reconnect automatically once active.

#### Option B: Local Neo4j via Docker
Run a local Neo4j container without cloud accounts:
```bash
docker compose up -d neo4j
```
Wait ~30 seconds for the Bolt protocol to start. The local instance will be available at `bolt://localhost:7687` with username `neo4j` and password `testpassword` (as defined in `docker-compose.yml`). Access the Neo4j browser at <http://localhost:7474>.

### 3. Set Up Python Virtual Environment

**Windows PowerShell:**
```powershell
python -m venv backend\venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\backend\venv\Scripts\Activate.ps1
```

**macOS / Linux:**
```bash
python3 -m venv backend/venv
source backend/venv/bin/activate
```

Verify your active Python interpreter:
```bash
python -c "import sys; print(sys.executable)"
```
*(The path must point inside `backend/venv`)*.

### 4. Install Dependencies

Install the backend requirements, register the intelligence package in editable mode, and install frontend packages:

```bash
# 1. Install backend requirements
pip install -r backend/requirements.txt

# 2. Install intelligence package (mandatory)
pip install -e ./intelligence

# 3. Verify intelligence package resolution
python -c "import graph, legal, reconciliation; print('Intelligence package installed successfully.')"

# 4. Install frontend dependencies
cd frontend
npm install
cd ..
```

### 5. Configure Environment Variables

Create `backend/.env` (reference `backend/.env.example`):

```ini
# --- Neo4j Graph Database ---
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# --- Supabase ---
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# --- AI & GitHub Integrations ---
GEMINI_API_KEY=your-gemini-api-key
GITHUB_TOKEN=github_pat_your_token

# --- Application & Auth Security ---
APP_ENV=development
JWT_SECRET=your-secure-random-jwt-secret-string

# --- Safety Gates for Pull Requests ---
GITHUB_DRY_RUN=true       # true: drafts and logs amendments locally without pushing to GitHub
PR_ALLOWED_REPOS=         # comma-separated repo list allowed for live PRs (e.g., owner/repo)

# --- Rate Limits & Concurrency ---
SCAN_RATE_LIMIT_PER_HOUR=10
SCAN_MAX_CONCURRENT=2

# --- Optional Vendor Connectors & Webhooks ---
GITHUB_WEBHOOK_SECRET=
MIXPANEL_TOKEN=
FIREBASE_SERVICE_ACCOUNT_PATH=
```

> **Safety Default:**  
> `GITHUB_DRY_RUN=true` is enabled by default. Statutory amendments and diffs are generated, validated, and logged to the UI review queue without opening live pull requests on GitHub. Set to `false` and specify `PR_ALLOWED_REPOS` only when you are ready to transmit pull requests upstream.

**Frontend Configuration:**  
The frontend connects to `http://localhost:8000/api/v1` by default. To customize this, create `frontend/.env.local`:
```ini
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### 6. Populate the Compliance Graph

Run the initialization scripts from the `intelligence/` folder with your virtual environment active:

```bash
cd intelligence

# 1. Apply schema indexes and constraints
python -m graph.apply_schema

# 2. Ingest the DPDP Act 2023 statutory clauses (~2 mins, uses Gemini)
python -m legal.load_dpdp_clauses --yes

# 3. Scan a target repository into the graph
python -m graph.run_scan_and_write OWNER/REPO --system my-system --yes

# 4. Load published privacy policies and terms
python -m legal.load_policies --dir ../path/to/docs --yes
# Or directly from a GitHub repository:
# python -m legal.load_policies --repo OWNER/REPO --yes

# 5. Execute reconciliation and generate compliance gaps
python -m reconciliation.run_reconciliation --system my-system --yes
```

Inspect the populated knowledge graph summary via CLI:
```bash
python -m retrieval.query_cli summary
```

> **Important Note on Policy Ingestion (Step 4):**  
> Niam compares code data flows against statutory rules **and** published policy disclosures. If no `:PolicyDocument` nodes are loaded, disclosure checks are skipped rather than marking all data as undisclosed. Ensure policy documents are ingested to assess Section 8 notice compliance.

### 7. Run the Application

Start the backend API and frontend dev server in two separate terminals:

**Terminal 1 (Backend API):**
```powershell
.\backend\venv\Scripts\Activate.ps1     # macOS/Linux: source backend/venv/bin/activate
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 (Frontend UI):**
```bash
cd frontend
npm run dev
```

- **Frontend Application**: <http://localhost:5173>
- **FastAPI OpenAPI Interactive Documentation**: <http://localhost:8000/docs>
- **API Health Check**: <http://localhost:8000/api/v1/health>

---

## Security Architecture

Niam is designed to audit sensitive codebases and handle regulatory obligations securely:

1. **Ticket-Based SSE Token Transmission**
   - Real-time scan telemetry avoids leaking the user's primary JWT in URL query parameters (`?token=...`).
   - The frontend requests a single-purpose, 5-minute expiry SSE ticket (`POST /api/v1/auth/sse-token`) with its Bearer JWT.
   - The EventSource connection validates this ticket specifically for streaming, preventing token exposure in browser histories and proxy logs.

2. **Self-Healing Database Connectivity**
   - The Neo4j driver utilizes a singleton pattern with active `driver.verify_connectivity()` validation.
   - If cloud instances (e.g., AuraDB) pause or drop connections, the driver re-establishes connectivity automatically on the next query without requiring an API server restart.

3. **Sanitized Exception Handling**
   - Stack traces and internal server paths are trapped and logged server-side.
   - External clients receive sanitized, structured HTTP error payloads to prevent system reconnaissance.

4. **Payload Validation & Webhook Protection**
   - Incoming webhook payloads are guarded with explicit JSON decoding validation and HMAC signature verification.
   - Malformed payloads return explicit HTTP 400 Bad Request responses rather than causing unhandled 500 server crashes.

---

## Testing & Verification

Run the test suite across the intelligence engine and backend API:

```bash
# Run intelligence tests (reconciler and graph verifier)
cd intelligence
pytest reconciliation/test_reconciler.py reasoning/test_verifier.py -q

# Run backend API tests
cd ../backend
pytest tests -q

# Run frontend typecheck and production build
cd ../frontend
npm run typecheck
npm run build
```

---

## Troubleshooting

| Symptom | Primary Cause | Resolution |
|---|---|---|
| `ModuleNotFoundError: No module named 'graph'` | `pip install -e ./intelligence` was not executed in the active virtual environment. | Run `pip install -e ./intelligence` inside `backend/venv`. Verify via `python -c "import sys; print(sys.executable)"`. |
| Every page displays "Graph unreachable" | Neo4j AuraDB instance is paused or credentials in `backend/.env` are incorrect. | Resume instance in Aura console. Niam will automatically reconnect without needing a backend restart. |
| `running scripts is disabled on this system` (PowerShell) | PowerShell execution policy restricts script activation. | Execute `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in the current session. |
| GitHub scan returns 404 for existing repository | `GITHUB_TOKEN` lacks read permissions for the repository. | Generate a fine-grained GitHub token granting *Contents* read permissions for the target repository. |
| Scan telemetry fails to connect via SSE | Short-lived ticket token generation failed or expired. | Verify `/api/v1/auth/sse-token` is reachable and `JWT_SECRET` is properly set in `backend/.env`. |
| Pull request generated locally but absent on GitHub | Dry-run protection is active. | This is expected default behavior (`GITHUB_DRY_RUN=true`). Change to `false` in `backend/.env` to push to GitHub. |
| No "shared without disclosure" gaps identified | Step 6.4 was skipped (no policy documents in the graph). | Ingest company privacy policy documents using `python -m legal.load_policies --dir <path> --yes`. |

---

## Current Scope & Limitations

- **Heuristic & LLM-Assisted Classification**: Candidate data types are discovered via keyword pre-filtering and classified using Google Gemini against a strict taxonomy. Data flows not identified by pre-filters are not submitted to the graph.
- **Clause Specificity**: DPDP Act sections often formulate general obligations around personal data rather than specific data categories. Findings report the statutory legal basis accurately rather than assuming false granular precision.
- **Human-in-the-Loop Remediations**: Generated policy language and remediation diffs are intended to assist legal counsel, not replace statutory legal sign-off.

---

## License

All rights reserved. Proprietary software.
