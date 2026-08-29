# Nia

A Compliance Operating System for India's DPDP Act 2023 — continuously maps a company's engineering, legal, and business stack into one living graph, and keeps code, infrastructure, vendors, and legal documents synchronised automatically instead of producing a report that goes stale.

## Tech Stack

- **Frontend** — React (Vite), Tailwind CSS, D3.js, Axios
- **Backend** — FastAPI (Python), Neo4j
- **Intelligence** — Gemini API (LLM-assisted compliance extraction), Tree-sitter
- **Database** — Neo4j (graph database)
- **Integrations** — GitHub API, vendor APIs (Stripe / Mixpanel / Firebase)

## Project Structure

```text
nia/
├── backend/app/
│   ├── api/          # FastAPI entrypoint + v1 endpoints (compliance, graph, github, etc.)
│   ├── core/         # Configuration and security
│   ├── db/           # Neo4j database connection
│   ├── schemas/      # Pydantic models for API resources
│   └── services/     # Business logic mapping to endpoints
│
├── frontend/src/
│   ├── components/   # UI components (graph, dashboard, layout, etc.)
│   ├── hooks/        # React hooks for API data fetching
│   ├── pages/        # Dashboard, Graph, Policies, Settings, etc.
│   └── services/api/ # Axios client
│
└── intelligence/
    ├── demo/         # Scripts to seed demo data
    ├── graph/        # Graph schema, node/edge builders, and Neo4j client
    ├── ingestion/    # GitHub code scanning and vendor API ingestion
    ├── legal/        # DPDP Act extraction and clause parsing
    └── retrieval/    # Query generation and CLI
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20.x (LTS)
- A Neo4j instance (AuraDB free tier works fine)

### Backend & Intelligence Setup

```bash
# Create virtual environment from the project root
python -m venv nia_env
source nia_env/bin/activate      # Windows: nia_env\Scripts\activate

# Install intelligence module (editable mode)
pip install -e ./intelligence

# Install backend dependencies
cd backend
pip install fastapi uvicorn neo4j python-dotenv httpx pydantic requests beautifulsoup4 gitpython tree_sitter pandas tqdm
```

Create a `.env` file inside `backend/` (this file acts as the single source of truth for both backend and intelligence):

Run the backend:

```bash
uvicorn app.main:app --reload
```

The API will be live at `http://localhost:8000`.

### Frontend Setup

```bash
cd frontend
npm install
```

Create a `.env` file inside `frontend/`:

Run the frontend:

```bash
npm run dev
```

The app will be live at `http://localhost:5173`.

## How It Works

1. **Ingestion** — scans the connected GitHub repo and connected vendors (Stripe/Mixpanel/Firebase) for data-handling code paths and event schemas.
2. **Graph** — assembles ingested signals into a Neo4j graph: data → API → database → vendor → legal obligation → policy clause.
3. **Reconciliation** — on every merge to `main`, a webhook triggers a diff-based re-check of the graph for gaps (a data flow with no matching legal clause).
4. **Remediation** — for each gap, drafts the exact clause text needed using Gemini, and opens a real pull request against the policy repo for human review.

Nothing is auto-merged — every generated change goes through normal code review before it touches a real document.
