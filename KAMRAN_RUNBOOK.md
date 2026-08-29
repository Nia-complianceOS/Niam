# Niam — Kamran's Runbook

Every **[KAMRAN]** step from `ACTION_PLAN.md`, expanded into exact terminals, directories and
commands. Written for **Windows PowerShell** (your setup: `D:\nia\NIA`, Python 3.12 venv at
`backend\venv`).

> ### Read this first — three Windows gotchas
>
> 1. **`curl` in PowerShell is not curl.** It's an alias for `Invoke-WebRequest` and rejects
>    `-s`, `-i`, `-H`. **Always type `curl.exe`** (ships with Windows 10+). Every command below
>    already does.
> 2. **`VAR=value command` does not work in PowerShell.** That bash prefix syntax silently does
>    nothing. You must use `$env:VAR = "value"` — which persists for that whole window. This is
>    why the terminal discipline below matters so much.
> 3. **Never set `$env:NEO4J_*` in a window that talks to Aura.** One leaked variable and a
>    smoke test writes into your demo graph. The window-title ritual in S3 exists to make that
>    mistake visible.

> ### Standing rule — Claude does not touch `.env`
> Every `.env` edit in this runbook is **yours**, done in your own editor. Claude will never
> open, read, print or modify `backend\.env`, `frontend\.env` or `intelligence\.env`. When
> something fails, paste the **error message** into chat — never the file.

---

## Terminal layout — set this up once

Open **five** PowerShell windows. Title each one immediately; the title is your safety check.

| # | Title | Purpose | Talks to |
|---|---|---|---|
| **T1** | `DEMO-API` | Backend on :8000 | **Aura** |
| **T2** | `DEMO-UI` | Frontend on :5173 | T1 |
| **T3** | `SMOKE-API` | Backend on :8001 | **local Neo4j** |
| **T4** | `SMOKE-CLI` | intelligence CLIs | **local Neo4j** |
| **T5** | `CHECKS` | curl + read-only queries | **Aura** |

**In every window, first command:**
```powershell
$Host.UI.RawUI.WindowTitle = "DEMO-API"     # change the string per window
```

**T1, T2 and T5 must NEVER have `$env:NEO4J_URI` set.** Verify any time you're unsure:
```powershell
if ($env:NEO4J_URI) { Write-Host "CONTAMINATED - close this window" -ForegroundColor Red }
else { Write-Host "clean - safe for Aura" -ForegroundColor Green }
```

### Activating the venv (needed in T1, T3, T4, T5)
```powershell
cd D:\nia\NIA
.\backend\venv\Scripts\Activate.ps1
```
If you get *"running scripts is disabled on this system"*:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\backend\venv\Scripts\Activate.ps1
```
`-Scope Process` means it applies to that window only and resets when you close it.

Your prompt should now start with `(venv)`. Confirm you're on the right interpreter:
```powershell
python -c "import sys; print(sys.executable)"
# expect: D:\nia\NIA\backend\venv\Scripts\python.exe
```

### Starting the demo stack

**T1:**
```powershell
cd D:\nia\NIA\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
> `--host 127.0.0.1`, never `0.0.0.0`. While the auth bypass is on, the API must not be
> reachable from your network.

**T2:**
```powershell
cd D:\nia\NIA\frontend
npm run dev
```

---

# Phase S — Build the throwaway rig

## S1 — Local Neo4j for testing

**T5.** Check Docker is there:
```powershell
docker --version
```
- ✅ prints a version → continue.
- ❌ *"not recognized"* → Docker Desktop isn't installed or isn't running. Start Docker
  Desktop and retry. If you'd rather not install it, **skip to S1-ALT** below.

Start **only** the neo4j service (not the backend/frontend ones — those are the containers
that never worked, per D2):
```powershell
cd D:\nia\NIA
docker compose up -d neo4j
docker ps
```
Expect a container named `nia-neo4j` with ports `7474` and `7687`.

Open <http://localhost:7474> in a browser. Log in with **neo4j / testpassword**
(from `docker-compose.yml`'s `NEO4J_AUTH`).

> If login fails with an auth error, the container has an **old data volume** with a different
> password. Wipe and recreate:
> ```powershell
> docker compose down -v
> docker compose up -d neo4j
> ```
> `-v` deletes the volume. Safe — this database holds only test data.

### Why this is a local container and not a second Aura instance

**AuraDB Free gives you exactly one instance, holding exactly one database** (`neo4j`), capped
at 200k nodes / 400k relationships. Multi-database on Aura is Business Critical / Virtual
Dedicated Cloud only — it is in public preview there and **not available on Free**. So
`CREATE DATABASE smoke` is not an option for you, and there is no way to isolate test data
inside your one instance: `MERGE (d:DataType {name: …})` and `MERGE (v:Vendor {name: …})` are
keyed on name alone, so a smoke scan would merge straight into your demo nodes and inflate
every count on the dashboard.

**That is the whole reason the smoke database is a local container.** Nothing in this runbook
asks you for a second Aura instance, and nothing writes to Aura during a Smoke Check.

### S1-ALT — if you can't or won't run Docker
In descending order of how much they let you verify:

1. **Neo4j Desktop** (free, no Docker, normal Windows installer):
   <https://neo4j.com/download/>. Create a local DBMS, set the password to `testpassword`, and
   start it. It listens on `bolt://localhost:7687` — **every command in this runbook works
   unchanged.** This is the best fallback; nothing else is lost.
2. **A second free Aura instance under a different login.** Free tier is one instance *per
   account*, so a separate Google/GitHub login gets you a second one. Free, zero install, but
   you're juggling two consoles and two sets of credentials — and you'd be adding a second
   `.env`-shaped thing to keep straight, which is exactly what Phase G6 is trying to end.
3. **Dry-run only.** Every write in this codebase is opt-in: `scan_remote_repo.py` never
   writes, and `ingest_stripe.py` / `ingest_mixpanel.py` / `ingest_firebase_auth.py` only write
   with `--write`. This still verifies the scanner, the classifier, the mappers, and every API
   **read** path — which covers Smoke Checks A, B, C and F completely. What you lose is the
   write half of Smoke Check E: graph writes, the reconciler, and `:Gap` creation.
4. **Write-and-teardown against Aura.** *Last resort, and only after S5's snapshot exists and
   Claude's `gap_id` scoping fix has landed.* Even then, `DataType` and `Vendor` nodes merge
   into your demo data and cannot be cleanly un-merged. **I'd rather you skip a check than do
   this.**

Tell me which one you're on and I'll rewrite the affected Smoke Checks to match.

## S2 — The junk GitHub repo

Create a **private** repo named `niam-smoke-repo`. Via the web UI, or in **T5**:
```powershell
gh repo create niam-smoke-repo --private --clone
cd niam-smoke-repo
```
*(If `gh` isn't installed, create it at <https://github.com/new> and `git clone` it.)*

Add ~6 small files with obvious data-handling patterns so the scanner has something to find.
For example, `signup.py`:
```python
def create_account(email, phone, dob):
    db.users.insert({"email": email, "phone": phone, "date_of_birth": dob})
    stripe.Customer.create(email=email)
    mixpanel.track(email, "Signed Up", {"ip": request.remote_addr})
```
Then:
```powershell
git add .
git commit -m "smoke fixtures"
git push
```

**Keep it tiny.** Scans stay fast, Gemini quota stays cheap, and PR tests land somewhere
harmless. **Never point a Smoke Check at a repo you care about.**

## S3 — The smoke terminal ritual

**Run this as the first thing in T3 and T4, every time you open them.** Nothing is written to
disk; these variables live and die with the window, and they override `.env` because both
`python-dotenv` and `pydantic-settings` let real environment variables win.

```powershell
$Host.UI.RawUI.WindowTitle = "SMOKE-CLI"        # or SMOKE-API in T3
$env:NEO4J_URI      = "bolt://localhost:7687"
$env:NEO4J_USERNAME = "neo4j"
$env:NEO4J_USER     = "neo4j"
$env:NEO4J_PASSWORD = "testpassword"
Write-Host "SMOKE MODE - local Neo4j only" -ForegroundColor Yellow
```
> Both `NEO4J_USERNAME` and `NEO4J_USER` are set on purpose: the config accepts either, and
> setting both means it doesn't matter which one your `.env` uses. **You still never open that
> file.**

**T3 — the smoke API:**
```powershell
cd D:\nia\NIA\backend
.\venv\Scripts\Activate.ps1
# ...paste the S3 block above...
uvicorn app.main:app --port 8001 --host 127.0.0.1
```

**T4 — the smoke CLIs.** Note the directory: these must run from `intelligence\`, because
`graph`, `legal` and `ingestion` are top-level packages there and the package isn't installed
into the venv yet (that's Phase G1).
```powershell
cd D:\nia\NIA\intelligence
..\backend\venv\Scripts\Activate.ps1
# ...paste the S3 block above...
python -m graph.apply_schema
python -m legal.load_dpdp_clauses --yes
python -m graph.run_scan_and_write <your-github-username>/niam-smoke-repo --system niam-smoke --yes
```

## S4 — *(Claude's task — the `gap_id` scoping fix and the `system_name` API parameter)*

## S5 — Baseline your demo graph

**T5 — must be a clean window** (no `$env:NEO4J_*`):
```powershell
cd D:\nia\NIA\intelligence
..\backend\venv\Scripts\Activate.ps1
if ($env:NEO4J_URI) { Write-Host "STOP - contaminated window" -ForegroundColor Red }
mkdir ..\smoke -Force
python -m retrieval.query_cli summary | Tee-Object ..\smoke\graph_baseline.txt
```
Save the four numbers. **Re-run this after every Smoke Check. If they moved and you only ran
smoke commands, a variable leaked — stop and find it before writing more code.**

### S5b — Take a real backup, not just a count

AuraDB Free lets you **export one backup snapshot at a time** (no rolling 7-day backups like
the paid tiers). That single snapshot is your only real undo, and it costs two clicks:

1. <https://console.neo4j.io> → your instance → **Backup & restore** (or the **⋮** menu) →
   **Create snapshot** / **Export**.
2. Download the dump and keep it somewhere outside the repo — e.g. `D:\niam-backups\`.

**Do this before Phase F3** (the `DEFAULT_SYSTEM_NAME` rename, the only step in this plan that
mutates existing demo data) **and before any Phase B re-load of the DPDP Act.** With one
instance and no point-in-time restore, this snapshot is the difference between a five-minute
recovery and re-running every scan from scratch.

> Your graph is nowhere near the Free caps (200k nodes / 400k relationships), so size is not a
> concern — but the caps are worth knowing before you scan anything large.

> ### ✅ Smoke Check S — sign off
> ```powershell
> docker ps                                      # nia-neo4j running
> # T4 (smoke): the scan above completed
> # T5 (clean): re-run query_cli summary
> Compare-Object (Get-Content ..\smoke\graph_baseline.txt) (python -m retrieval.query_cli summary)
> ```
> `Compare-Object` printing **nothing** means Aura is untouched. That's the pass condition.

---

# Phase B — Environment, Neo4j and GitHub

## B1 — Confirm the demo graph is alive

**T5 (clean window):**
```powershell
curl.exe -s http://localhost:8000/api/v1/health
```
Expect `{"status":"ok","environment":"development","neo4j_connected":true}`.

```powershell
cd D:\nia\NIA\intelligence
..\backend\venv\Scripts\Activate.ps1
python -m retrieval.query_cli summary
```

**Branch on what you see:**

| Result | Do this (in T5, clean window, from `D:\nia\NIA\intelligence`) |
|---|---|
| `clauses = 0` | `python -m legal.load_dpdp_clauses --yes` — takes a few minutes, downloads and parses the Act PDF. **Until this runs, the compliance score and Regulations page are meaningless.** |
| `systems = 0` | `python -m graph.apply_schema` then `python -m graph.run_scan_and_write <owner>/<repo> --yes` on a repo you own |
| `neo4j_connected: false` | See B1-FAIL below |
| all four non-zero | Done — go to B2 |

### B1-FAIL — connection errors
- **"unauthorized … authentication failure"** → your **Aura Free instance was paused or
  recreated**. Free instances auto-pause when idle and are **deleted after 30 days of
  inactivity** (Neo4j's own FAQ).
  Open <https://console.neo4j.io>, check the instance state, and **Resume** it. If it's gone,
  create a new one, download the credentials, and update the values in `backend\.env`
  **yourself**. Paste the *error text* into chat, never the file.
- **"unreachable / ServiceUnavailable"** → instance is resuming (can take a minute), or you're
  offline.
- **Any credential error: do not paste the file.** Tell me the error string and I'll tell you
  which key it points at.

## B2 — Environment values (your editor, not the terminal)

Open `D:\nia\NIA\backend\.env` in VS Code and set:

| Key | Value | Why |
|---|---|---|
| `USE_MOCKS` | `false` | Confirm it isn't `true` |
| `APP_ENV` | `development` | The A1 auth guard keys off this — anything else disables the bypass |
| `JWT_SECRET` | a long random string | Currently defaults to `dev-secret-do-not-use-in-prod` |
| `GITHUB_WEBHOOK_SECRET` | a random string | Webhook only fails closed outside development |
| `NEO4J_USERNAME` | **leave exactly as it is** | The config now accepts both spellings — do not "tidy" it |
| `NIA_ENV_PATH` | **leave as-is until Phase F** | Renamed there, with a fallback so nothing breaks |

Generate a random secret in **T5**:
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

Restart T1 after editing (`Ctrl+C`, then re-run uvicorn). `--reload` watches `.py` files, **not
`.env`**, so config changes need a real restart.

## B3 — Rotate the GitHub PAT

Your token has been reachable through an unauthenticated endpoint. Treat it as compromised.

1. <https://github.com/settings/tokens> → find the current token → **Delete**.
2. **Fine-grained tokens** → **Generate new token**.
3. Repository access → **Only select repositories** → your demo repo **and** `niam-smoke-repo`.
4. Permissions → **Contents: Read and write**, **Pull requests: Read and write**. Nothing else.
5. Expiration: 30 days.
6. Copy it into `backend\.env` as `GITHUB_TOKEN=` **yourself**. Don't paste it into chat.
7. Restart T1.

> ### ✅ Smoke Check B
> **T5 (clean):** `python -m retrieval.query_cli summary` → four non-zero counts.
> **T4 (smoke):** confirm the new PAT works, without writing anything:
> ```powershell
> cd D:\nia\NIA\intelligence
> python -m ingestion.github.scan_remote_repo <your-username>/niam-smoke-repo
> ```
> No `--write` flag, so nothing reaches any database. It should print a candidate summary.
> - ❌ Gemini errors → `python -m ingestion.github.smoke_test`. AI Studio keys start `AIza…`.
>   Fix it in `.env` yourself; don't paste the key.

---

# Smoke Check A — after Claude's security fixes

**T3 (smoke API on :8001) must be running.** All commands in **T5**:

```powershell
# 1. No token -> must be 401
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8001/api/v1/gaps

# 2. Bypass token in development -> 200
curl.exe -s -o NUL -w "%{http_code}`n" -H "Authorization: Bearer mock-token-123" http://localhost:8001/api/v1/gaps

# 3. Dashboard must not claim an outage
curl.exe -s -H "Authorization: Bearer mock-token-123" http://localhost:8001/api/v1/dashboard/summary | Select-String "unreachable"
```
Expected: `401`, then `200`, then **no match** on line 3.

**4. The production guard.** In a *new* window, with the S3 smoke vars set:
```powershell
$env:APP_ENV = "production"
cd D:\nia\NIA\backend
uvicorn app.main:app --port 8002 --host 127.0.0.1
```
Expect a refusal or a loud warning, and `Bearer mock-token-123` to return **401** on :8002.
Close that window afterwards so `APP_ENV` doesn't linger.

**5. The A3 regression test — the one most likely to catch a bad fix.** Wipe the smoke DB so it
has zero `:DPDPClause` nodes, then check the dashboard still returns *real zeros* rather than
"Graph unreachable":
```powershell
docker compose down -v
docker compose up -d neo4j
Start-Sleep -Seconds 20
curl.exe -s -H "Authorization: Bearer mock-token-123" http://localhost:8001/api/v1/dashboard/summary
```
An empty graph must read as **empty**, not as an outage.

**6.** Confirm `POST /gaps/{id}/open-pr` in DRY_RUN logs its intent in T3 and creates nothing on
GitHub. Check the repo's branch list — there should be no `niam/remediation/*` branch.

**7. Teardown + baseline:**
```powershell
# T5, clean window
cd D:\nia\NIA\intelligence
Compare-Object (Get-Content ..\smoke\graph_baseline.txt) (python -m retrieval.query_cli summary)
```

---

# Smoke Check C — the honest-UI walkthrough

Run a **second frontend** against the smoke API. **New window, T6:**
```powershell
$Host.UI.RawUI.WindowTitle = "SMOKE-UI"
cd D:\nia\NIA\frontend
$env:VITE_API_BASE_URL = "http://localhost:8001/api/v1"
npm run dev -- --port 5174
```
Open <http://localhost:5174>.

**Verify it actually hit the smoke API:** F12 → Network → reload → requests must go to
**:8001**, not :8000.
> If they still go to :8000, Vite didn't pick up the shell variable. Fallback: create
> `frontend\.env.local` with `VITE_API_BASE_URL=http://localhost:8001/api/v1`, restart, and
> **delete that file when you're done** so your normal `npm run dev` goes back to :8000.
> `.env.local` is gitignored, so it won't be committed either way.

Now walk **all nine pages, twice** — once with the smoke DB populated, once wiped
(`docker compose down -v; docker compose up -d neo4j`).

For every number on screen, say out loud which node or endpoint produced it:

| Page | Populated | Wiped |
|---|---|---|
| Dashboard | 5 real cards; no timeline/commit feed (or a `SAMPLE DATA` ribbon) | zeros, **not** "Graph unreachable" |
| Compliance Graph | nodes visible | "No graph data yet" |
| Repositories | repo input + Scan button | same, empty list |
| Vendors | `N detected · M connected`, "Detected in code" badges | "No vendors connected yet" |
| Regulations | DPDP with a real score, countdown to **13 Nov 2026** | "Graph unreachable" is acceptable only here, and only if clauses are genuinely absent |
| Policies | empty state, **not** a red 503 | same |
| Pull Requests | empty state, **not** a red 503 | same |
| Audit Trail | real gap events, no "Priya S." | empty state |
| Settings | read-only health panel only | same |

**Pass condition: no number appears on the wiped DB.** Anything still showing is hardcoded —
tell me which page and I'll find it.

---

# Smoke Check E — full pipeline on the rig

**T4 (smoke vars set), from `D:\nia\NIA\intelligence`:**
```powershell
python -m graph.apply_schema
python -m legal.load_dpdp_clauses --yes
python -m graph.run_scan_and_write <your-username>/niam-smoke-repo --system niam-smoke --yes
python -m reconciliation.run_reconciliation --system niam-smoke --yes
```

Then in the smoke UI (<http://localhost:5174>):
1. A gap appears on the Dashboard (this only works if E1 wrote `source_commit_sha`).
2. **Generate fix** produces a draft.
3. **Open PR** in DRY_RUN logs its intent against `niam-smoke-repo` and **creates nothing** —
   confirm no new branch exists on GitHub.

**The E4 duplicate-provenance test.** Run the scan a *second* time, then in Neo4j Browser
(<http://localhost:7474>):
```cypher
MATCH ()-[r:COLLECTS]->() RETURN size(r.sources) AS n ORDER BY n DESC LIMIT 5
```
The numbers must **not** double between the first and second scan. If they do, E4 didn't land.

**The isolation test:** in T5 (clean), confirm your Aura gaps are untouched:
```cypher
MATCH (g:Gap) RETURN g.id ORDER BY g.id
```
No id should start with `gap-niam-smoke-`. If demo gap ids changed, S4's scoping fix failed —
**stop and tell me.**

**Teardown:**
```powershell
docker compose down -v
docker compose up -d neo4j
```

---

# Phase F4 — Renames only you can do

**Do these after the demo, and in this order.**

## F4.1 — GitHub repo rename (safe, do anytime)
1. <https://github.com/Nia-complianceOS/NIA> → **Settings** → rename to `Niam` → **Rename**.
2. **T5:**
```powershell
cd D:\nia\NIA
git remote set-url origin https://github.com/Nia-complianceOS/Niam.git
git remote -v
git fetch
```
GitHub redirects the old URL automatically, so nothing breaks if you forget — but fix it anyway.
*(The org `Nia-complianceOS` stays, per D3.)*

## F4.2 — `package.json` rename
Claude edits the name; you regenerate the lockfile. **T2, after stopping the dev server:**
```powershell
cd D:\nia\NIA\frontend
npm install
npm run dev
```

## F4.3 — Aura instance rename (cosmetic, zero risk)
<https://console.neo4j.io> → your instance → rename to `Niam`.
**This does not change the URI or the password**, so no `.env` edit is needed.

## F4.4 — `APP_NAME` in `.env` (optional, yours)
Change `APP_NAME=NIA Backend` to `APP_NAME=Niam Backend` if you want. Purely cosmetic —
Claude's change to the code default has no effect while `.env` sets this key.

## F4.5 — Local folder rename ⚠️ **most dangerous step in this runbook**

Renaming `D:\nia\NIA` **breaks your venv**: Python virtual environments hard-code their
absolute path, so `backend\venv` stops working the moment the folder moves. You must rebuild
it in the same sitting.

**Stop every terminal and VS Code first.** Then:

```powershell
# 1. Rename (from a directory outside the tree)
cd D:\
Rename-Item -Path "D:\nia" -NewName "niam"
Rename-Item -Path "D:\niam\NIA" -NewName "Niam"
# result: D:\niam\Niam

# 2. Delete the now-broken venv
cd D:\niam\Niam
Remove-Item -Recurse -Force backend\venv

# 3. Rebuild it
python -m venv backend\venv
.\backend\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -e .\intelligence          # do this now — it's Phase G1 and it belongs here

# 4. Verify
python -c "import sys; print(sys.executable)"
python -c "from graph.graph_writer import GraphWriter; print('intelligence import OK')"
```

**Then fix the hardcoded path in `.vscode\settings.json`** — it currently reads
`D:\\nia\\NIA\\backend\\venv\\Scripts\\python.exe` and will point at nothing:
```json
"python.defaultInterpreterPath": "D:\\niam\\Niam\\backend\\venv\\Scripts\\python.exe"
```

**Then re-run Smoke Check E in full.** This is the step most likely to break imports, and E is
the only check that exercises every import path at once.

> If step 3 fails, **stop and tell me the error** — do not start deleting things. Your code is
> all in git; only the venv is unrecoverable, and it's rebuildable in two minutes.

---

# Phase G6 — Consolidating to one `.env`

Claude will change the *code* so both trees resolve a single root `.env` via `find_dotenv()`,
then hand this to you. **Claude does not move, merge, read or delete any `.env` file.**

When that lands, you will:
1. Open `backend\.env`, `frontend\.env` and `intelligence\.env` side by side in VS Code.
2. Create `D:\niam\Niam\.env` with the union of the keys, resolving any conflicts yourself.
   *(`frontend\.env` holds only `VITE_API_BASE_URL` — Vite needs that one to stay in
   `frontend\`, so keep it where it is.)*
3. Delete `backend\.env` and `intelligence\.env` **only after** `curl.exe -s
   http://localhost:8000/api/v1/health` still returns `neo4j_connected: true`.
4. Confirm `.env` is still gitignored: `git check-ignore -v .env` should print a match.

---

# Quick reference

| I want to… | Window | From | Command |
|---|---|---|---|
| Start the demo API | T1 | `backend\` | `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` |
| Start the demo UI | T2 | `frontend\` | `npm run dev` |
| Check the API is healthy | T5 | anywhere | `curl.exe -s http://localhost:8000/api/v1/health` |
| See what's in the demo graph | T5 | `intelligence\` | `python -m retrieval.query_cli summary` |
| Load the DPDP Act | T5 | `intelligence\` | `python -m legal.load_dpdp_clauses --yes` |
| Scan a repo into the demo graph | T5 | `intelligence\` | `python -m graph.run_scan_and_write <owner>/<repo> --yes` |
| Scan without writing anything | T5 | `intelligence\` | `python -m ingestion.github.scan_remote_repo <owner>/<repo>` |
| Start the smoke DB | T5 | repo root | `docker compose up -d neo4j` |
| Wipe the smoke DB | T5 | repo root | `docker compose down -v; docker compose up -d neo4j` |
| Start the smoke API | T3 | `backend\` | S3 block, then `uvicorn app.main:app --port 8001 --host 127.0.0.1` |
| Run a smoke scan | T4 | `intelligence\` | S3 block, then `... --system niam-smoke --yes` |
| Check a window is Aura-safe | any | anywhere | `if ($env:NEO4J_URI) { "CONTAMINATED" } else { "clean" }` |
| Confirm Aura wasn't touched | T5 | `intelligence\` | `Compare-Object (Get-Content ..\smoke\graph_baseline.txt) (python -m retrieval.query_cli summary)` |
