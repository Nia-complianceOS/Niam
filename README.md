# Nia

A Compliance Operating System for India's DPDP Act 2023 — continuously maps a company's engineering, legal, and business stack into one living graph, and keeps code, infrastructure, vendors, and legal documents synchronised automatically instead of producing a report that goes stale.

## Tech Stack

- **Frontend** — React (Vite), Tailwind CSS, D3.js, Axios
- **Backend** — FastAPI (Python), Neo4j, Anthropic Claude API
- **Database** — Neo4j (graph database)
- **Integrations** — GitHub API, vendor APIs (Stripe / Mixpanel / Firebase)

## Project Structure

```
nia/
├── backend/
│   ├── api/                 # FastAPI app entrypoint + routes
│   │   ├── main.py
│   │   ├── routes/
│   │   │   ├── graph.py
│   │   │   ├── gaps.py
│   │   │   └── webhook.py
│   │   └── pr_service.py    # opens GitHub pull requests for compliance fixes
│   ├── db/
│   │   └── neo4j_connection.py
│   ├── graph/                # graph schema + Neo4j client
│   │   ├── neo4j_client.py
│   │   └── schema.py
│   ├── ingestion/            # code scanner + vendor ingestion
│   │   ├── code_scanner.py
│   │   └── vendor_ingest.py
│   ├── legal/                # LLM-assisted privacy policy / clause parsing
│   │   └── clause_parser.py
│   ├── reconciliation/       # gap detection + remediation drafting
│   │   ├── reconciler.py
│   │   └── remediation_drafter.py
│   ├── tests/
│   └── .env                  # not committed
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js
│   │   ├── components/
│   │   │   ├── ScoreRing.jsx
│   │   │   ├── NodeStatusList.jsx
│   │   │   ├── GraphView.jsx
│   │   │   ├── GapDetail.jsx
│   │   │   └── GitBlameView.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Graph.jsx
│   │   │   └── Gaps.jsx
│   │   └── App.jsx
│   └── .env                  # not committed
│
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20.x (LTS)
- A Neo4j instance (AuraDB free tier works fine)

### Backend Setup

```bash
cd backend
python -m venv nia_env
source nia_env/bin/activate      # Windows: nia_env\Scripts\activate

pip install fastapi uvicorn neo4j python-dotenv pygithub httpx pydantic requests beautifulsoup4 gitpython tree_sitter anthropic pandas tqdm
```

Create a `.env` file inside `backend/`:

Run the backend:

```bash
uvicorn api.main:app --reload
```

The API will be live at `http://localhost:8000`.

### Frontend Setup

```bash
cd frontend
npm install
npm install -D tailwindcss postcss autoprefixer
npm install d3 recharts lucide-react axios
```

Create a `.env` file inside `frontend/`:

Run the frontend:

```bash
npm run dev
```

The app will be live at `http://localhost:5173`.

## How It Works

1. **Ingestion** — scans the connected GitHub repo and one connected vendor (Stripe/Mixpanel/Firebase) for data-handling code paths and event schemas.
2. **Graph** — assembles ingested signals into a Neo4j graph: data → API → database → vendor → legal obligation → policy clause.
3. **Reconciliation** — on every merge to `main`, a webhook triggers a diff-based re-check of the graph for gaps (a data flow with no matching legal clause).
4. **Remediation** — for each gap, drafts the exact clause text needed and opens a real pull request against the policy repo for human review.

Nothing is auto-merged — every generated change goes through normal code review before it touches a real document.

