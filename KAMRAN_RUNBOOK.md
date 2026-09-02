# Niam — Kamran's Runbook

Every **[KAMRAN]** step from `ACTION_PLAN.md`, expanded into exact terminals, directories and
commands. Written for **Windows PowerShell** (your setup: `D:\niamm\Niam`, Python 3.12 venv at
`backend\venv`).

> ### Read this first — six Windows gotchas that have already cost us time
>
> 1. **`curl` in PowerShell is not curl.** It's an alias for `Invoke-WebRequest` and rejects
>    `-s`, `-i`, `-H`. **Always type `curl.exe`** (ships with Windows 10+). Every command below
>    already does.
> 2. **`VAR=value command` does not work in PowerShell.** That bash prefix syntax silently does
>    nothing. You must use `$env:VAR = "value"` — which persists for that whole window. This is
>    why the terminal discipline below matters so much.
> 3. **Angle-bracket placeholders break PowerShell.** `<` is a reserved redirection operator,
>    so `run_scan_and_write <you>/repo` dies with *"The '<' operator is reserved for future
>    use."* The smoke repo is now spelled out in full as `niacomplianceos/niam-smoke-repo`,
>    so those lines copy as-is. `OWNER/REPO` is still a placeholder — substitute a real repo,
>    no brackets. **Pasting a placeholder literally gives a 404 on a repo that genuinely does
>    not exist**, which reads exactly like a permissions problem. It has happened twice.
> 4. **Resetting `$env:Path` silently deactivates your venv.** Running
>    `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + ...`
>    wipes the venv's PATH prepend, so `python` becomes the *system* Python — while the
>    prompt still says `(venv)`. Symptom: `ModuleNotFoundError` for packages you know are
>    installed, or a python path under `AppData\Local\Programs\Python`. Check with
>    `python -c "import sys; print(sys.executable)"`.
>
>    The reverse also bites: re-running `Activate.ps1` while the venv is **already** active
>    calls `deactivate` first, which restores the PATH captured at the *original* activation —
>    silently undoing any manual PATH edit you made since. That's how a tool you just fixed
>    (`gh`, say) goes missing again.
>
>    **Don't hand-patch PATH. Open a fresh PowerShell window and activate there** — a new
>    session picks up the current Machine+User PATH, including anything installed after your
>    old windows were opened, and `Activate.ps1` prepends the venv cleanly on top. If you must
>    patch in place, put the venv first:
>    ```powershell
>    $env:Path = "D:\niamm\Niam\backend\venv\Scripts;" +
>                [Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
>                [Environment]::GetEnvironmentVariable("Path","User")
>    ```
> 5. **`gh` and the scanner use different GitHub identities.** `gh` uses its own login;
>    the scanner uses `GITHUB_TOKEN` from `.env`. `gh repo view` succeeding proves nothing
>    about whether a scan will work — and GitHub returns **404, not 403**, for a private repo
>    a token cannot see, so a permissions problem looks exactly like a missing repo. Check
>    both identities with `gh api user --jq .login` and
>    `python ..\smoke\check_repo_access.py OWNER/REPO` (run from `intelligence\`).
> 6. **Never set `$env:NEO4J_*` in a window that talks to Aura.** One leaked variable and a
>    smoke test writes into your demo graph. The window-title ritual in S3 exists to make that
>    mistake visible.

> ### Standing rule — Claude does not touch `.env`
> Every `.env` edit in this runbook is **yours**, done in your own editor. Claude will never
> open, read, print or modify `backend\.env`, `frontend\.env` or `intelligence\.env`. When
> something fails, paste the **error message** into chat — never the file.

---

# Step 0 — Pre-flight (do this first, every time)

**Close every PowerShell window you currently have open and start new ones.** A stale window
carries a stale PATH (it cannot see tools installed since it opened) and possibly leftover
`$env:NEO4J_*` from an earlier smoke run. Both have already bitten us. Fresh windows cost
five seconds and remove a whole class of failure.

In one fresh window, activate the venv and run the pre-flight script. It checks everything the
rest of the runbook assumes and prints no secrets — only presence, lengths and paths:

```powershell
cd D:\niamm\Niam
.\backend\venv\Scripts\Activate.ps1      # add Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass if blocked
.\smoke\preflight.ps1
```

**Expected:**

```
--- Niam pre-flight ---
python    : D:\niamm\Niam\backend\venv\Scripts\python.exe
deps      : ok
neo4j vars: clean (safe for Aura)
gh login  : <your gh login>
docker    : engine up
envfile   : D:\niamm\Niam\backend\.env
GITHUB_TOKEN: present, NN chars
GEMINI_API_KEY: present, NN chars
NEO4J_URI : present, NN chars
NEO4J_PASSWORD: present, NN chars

Pre-flight OK - proceed to the terminal layout.
```

| Line wrong | Go to |
|---|---|
| `python` points at `AppData\Local\Programs\Python` | gotcha 4 — fresh window, re-activate |
| `deps` MISSING | same — you're on the system Python |
| `neo4j vars: CONTAMINATED` | close the window, open a new one |
| `docker: engine DOWN` | S1-FIX, or S1-ALT (Neo4j Desktop) |
| `envfile : NOT FOUND` | you're not running from `intelligence\`, or `backend\.env` doesn't exist |
| any key `MISSING` | set it in `backend\.env` yourself — Claude never opens that file |

> **Why a script and not a paste-in block.** Pasting multi-line `if { } else { }` into an
> interactive PowerShell prompt fails: the console executes each line as it arrives, so the
> `if` completes on its own and the orphaned `else` errors with *"The term 'else' is not
> recognized."* Inside a `.ps1` file the parser sees the whole construct at once. If you ever
> do paste a conditional at the prompt, keep it on **one physical line**:
> `if ($env:NEO4J_URI) { "dirty" } else { "clean" }`

> **`GITHUB_TOKEN` needs `.env` loaded to be visible.** A bare
> `python -c "os.getenv('GITHUB_TOKEN')"` reports MISSING even when the token is set, because
> nothing has called `load_dotenv()` yet. The script resolves `backend\.env` exactly the way
> the scanner modules do, so what it reports is what the scanner will actually see.

> **The identity trap, up front.** `gh`'s login and `GITHUB_TOKEN`'s account are two different
> things and have already differed in this project. The scanner only ever uses `GITHUB_TOKEN`.
> Confirm which account that is before creating the smoke repo — see **S2**.

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
cd D:\niamm\Niam
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
# expect: D:\niamm\Niam\backend\venv\Scripts\python.exe
```

### Starting the demo stack

**T1:**
```powershell
cd D:\niamm\Niam\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
> `--host 127.0.0.1`, never `0.0.0.0`. While the auth bypass is on, the API must not be
> reachable from your network.

**T2:**
```powershell
cd D:\niamm\Niam\frontend
npm run dev
```

---

# Phase S — Build the throwaway rig

## S1 — Local Neo4j for testing

**T5.** Check the Docker **engine** is running — not just that the CLI exists:
```powershell
docker info *> $null; if ($LASTEXITCODE -eq 0) { "engine up" } else { "engine down" }
```
- **engine up** → skip to *Start the container* below.
- **engine down** → do **S1-FIX** first.
- `docker` *not recognized* → the CLI isn't installed at all. **Skip to S1-ALT.**

### S1-FIX — "failed to connect to the docker API at npipe:…dockerDesktopLinuxEngine"

A version number from `docker --version` only proves the **CLI** is installed. This error means
the **engine** (Docker Desktop) isn't running. Fix it in order:

**1. Find Docker Desktop.** Do **not** just test `C:\Program Files\Docker\` — recent versions
install per-user, so that path is often absent even on a perfectly working install. Search properly:
```powershell
$lnk = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu",
                     "$env:ProgramData\Microsoft\Windows\Start Menu" `
       -Recurse -Filter "Docker Desktop.lnk" -ErrorAction SilentlyContinue |
       Select-Object -First 1

if ($lnk) {
    $exe = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk.FullName).TargetPath
    Write-Host "Found: $exe" -ForegroundColor Green
} else {
    Write-Host "Docker Desktop not installed - use S1-ALT" -ForegroundColor Yellow
}
```
- Found → continue to step 2.
- Not found → you have the CLI without the Desktop app. Install it from
  <https://www.docker.com/products/docker-desktop/>, or **go to S1-ALT and use Neo4j Desktop**
  — honestly the faster path if you just want the smoke DB working today.

**2. Start it and wait for the engine.** Docker Desktop takes 30–90 seconds to come up, and the
CLI fails with this exact npipe error the entire time it is starting. `Start-Process` launches a
`.lnk` fine, so the Start-menu shortcut is a valid target — you never need the resolved exe path.
```powershell
Start-Process $lnk.FullName        # or just search "Docker Desktop" in the Start menu

foreach ($i in 1..36) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { Write-Host "Docker engine is up" -ForegroundColor Green; break }
    Start-Sleep -Seconds 5
}
```
Watch the whale icon in your system tray — it stops animating and the Desktop window reads
**"Engine running"** when it's ready.

**3. If it never comes up,** the usual cause on Windows is the WSL2 backend:
```powershell
wsl --status
wsl --update
```
Then restart Docker Desktop. If it still fails — Windows Home without virtualisation enabled,
or a corporate policy blocking Hyper-V/WSL — **stop here and use Neo4j Desktop (S1-ALT
option 1)**. Every command in this runbook works unchanged against it. Don't spend an evening
on Docker; it isn't what you're building.

### Start the container

> The `the attribute 'version' is obsolete` warning is harmless — modern Compose ignores the
> `version:` key. Deleting that one line from `docker-compose.yml` silences it.

Start **only** the neo4j service (not the backend/frontend ones — those are the containers
that never worked, per D2):
```powershell
cd D:\niamm\Niam
docker compose up -d neo4j
docker ps
```
Expect a container named `niam-neo4j` with ports `7474` and `7687`.

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

**The six fixture files already exist** at `D:\niamm\Niam\smoke\fixtures\` — six code files plus
a README documenting the expected scan output. They were written against
`diff_parser.DEFAULT_SIGNALS` and dry-run verified to produce **71 stage-1 candidate lines**
(~4 Gemini calls), covering 12–16 data types and 5–7 vendors, with one file
(`profile_api.ts`) deliberately carrying **no** vendor so the reconciler's
`ungoverned_collection` branch gets exercised.

### Create the repo **outside** the NIA tree

> ⚠️ **Do not create it inside `D:\niamm\Niam`.** A nested git repo with no commits breaks every
> `git add .` in the parent repo with:
> ```
> error: 'niam-smoke-repo/' does not have a commit checked out
> fatal: adding files failed
> ```
> If that already happened: `Move-Item D:\niamm\Niam\niam-smoke-repo D:\niamm-smoke-repo`.
> Nothing is lost — an empty clone has no commits to lose.

### First: which account will read it?

**The scanner authenticates as `GITHUB_TOKEN`'s account, not as `gh`.** In this project those
have differed — `gh` was `kamran-rashid` while `GITHUB_TOKEN` belonged to `niacomplianceos` —
and the result was a flat `404 Not Found` on a repo that existed and was pushed. GitHub returns
**404, not 403**, for a private repo a token cannot see, so it looks exactly like a typo.

Find out who the token is (T5, from `intelligence\`):
```powershell
python ..\smoke\check_repo_access.py OWNER/REPO
```
Line `[1] token identity` is the account that matters.

Then pick one, in order of preference:

| | Approach | Reads | Writes (needed later for `open-pr`) |
|---|---|---|---|
| **1** | **Make the smoke repo public** — fixtures are synthetic, nothing to protect | ✅ any token | ❌ still needs the owner's token |
| **2** | **Create it under `GITHUB_TOKEN`'s own account** | ✅ | ✅ — the only option that fully works |
| **3** | Keep it private elsewhere and add it to the token's *Only select repositories* | ✅ | ✅ if permissions allow |

**Option 2 is the one to choose if you have the login for that account** — it is the only one
that also lets Phase A2's `open-pr` test create a real branch later. Option 1 unblocks reading
in one click and is fine until then.

> Same question applies to your **demo** repo: if `GITHUB_TOKEN` can't see it, Phase B1's real
> scan will 404 identically. Settle this once, here.

### Create it — **outside** the NIA tree

```powershell
cd D:\
gh repo create niam-smoke-repo --public --clone
```
*(No `gh`? Create it at <https://github.com/new>, then `git clone` it into `D:\`. Changing
visibility later: repo → **Settings** → **General** → **Danger Zone** → **Change visibility**.)*

> **Switching `gh` to the token's account:** `gh auth switch` only works for accounts already
> logged in, so the first time you need `gh auth login` (browser flow) — it replaces the active
> account. Confirm with `gh api user --jq .login`.
>
> **If `gh repo create --clone` ends with `failed to run git: error: remote origin already
> exists`** — the repo *was* created on GitHub; only the local clone step failed, because a
> `D:\niamm-smoke-repo` directory already exists pointing at a different remote. Don't recreate
> anything. Repoint the existing clone and push:
> ```powershell
> cd D:\niamm-smoke-repo
> git remote set-url origin https://github.com/niacomplianceos/niam-smoke-repo.git
> git push -u origin main
> ```
> Then delete the abandoned repo under the other account so there's no ambiguity about which
> one the scanner reads.

### Populate and push
```powershell
Copy-Item D:\niamm\Niam\smoke\fixtures\* -Destination D:\niamm-smoke-repo\ -Recurse -Force
cd D:\niamm-smoke-repo
git add .
git commit -m "smoke fixtures"
git branch -M main
git push -u origin main
```

**Keep it tiny.** Scans stay fast, Gemini quota stays cheap, and Phase A2's `open-pr` tests
land somewhere harmless. **Never point a Smoke Check at a repo you care about.**

Verify the scanner can actually read it before moving on:
```powershell
cd D:\niamm\Niam\intelligence
python ..\smoke\check_repo_access.py niacomplianceos/niam-smoke-repo
```
All four checks must return **200**. `[2] 404` means the token can't see it — go back to the
table above. `[4] 404` with `[2] 200` means the repo has no commits yet — push first.

> `smoke/` is gitignored in the NIA repo, so the fixtures stay out of your product history
> while remaining on disk as the source of truth to re-copy from.

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
cd D:\niamm\Niam\backend
.\venv\Scripts\Activate.ps1
# ...paste the S3 block above...
uvicorn app.main:app --port 8001 --host 127.0.0.1
```

**T4 — the smoke CLIs.** Note the directory: these must run from `intelligence\`, because
`graph`, `legal` and `ingestion` are top-level packages there and the package isn't installed
into the venv yet (that's Phase G1).
```powershell
cd D:\niamm\Niam\intelligence
..\backend\venv\Scripts\Activate.ps1
# ...paste the S3 block above...
python -m graph.apply_schema
python -m legal.load_dpdp_clauses --yes
python -m graph.run_scan_and_write niacomplianceos/niam-smoke-repo --system niam-smoke --yes
```

## S4 — *(Claude's task — the `gap_id` scoping fix and the `system_name` API parameter)*

## S5 — Baseline your demo graph

**T5 — must be a clean window** (no `$env:NEO4J_*`):
```powershell
cd D:\niamm\Niam\intelligence
..\backend\venv\Scripts\Activate.ps1
if ($env:NEO4J_URI) { Write-Host "STOP - contaminated window" -ForegroundColor Red }
mkdir ..\smoke -Force
python -m retrieval.query_cli summary | Tee-Object ..\smoke\graph_baseline.txt
```
Save the four numbers. **Re-run this after every Smoke Check. If they moved and you only ran
smoke commands, a variable leaked — stop and find it before writing more code.**

### S5b — Take a snapshot (your only undo)

<https://console.neo4j.io> → your instance → **Snapshots** → **Take snapshot**.
It completes in seconds and shows as `Completed / On Demand` with a restore (↺) action.

**On AuraDB Free the snapshot cannot be downloaded** — the "Show exportable only" toggle
will hide it, because export-to-file is a paid-tier feature. That is fine for our purpose:
**restore-in-place is the undo**, and it is one click from that same row. What you do *not*
get is a copy that survives the instance being deleted, so don't rely on it as an archive.

**Take one before Phase F3** (the `DEFAULT_SYSTEM_NAME` rename — the only step in this plan
that mutates existing demo data) **and before any Phase B reload of the DPDP Act.**

> Your graph is nowhere near the Free caps (200k nodes / 400k relationships — you are at
> 53 nodes / 86 relationships), so size is not a concern.

> ### ✅ Smoke Check S — sign off
> ```powershell
> docker ps                                      # niam-neo4j running
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
cd D:\niamm\Niam\intelligence
..\backend\venv\Scripts\Activate.ps1
python -m retrieval.query_cli summary
```

**Branch on what you see:**

| Result | Do this (in T5, clean window, from `D:\niamm\Niam\intelligence`) |
|---|---|
| `clauses = 0` | `python -m legal.load_dpdp_clauses --yes` — see *Expected DPDP output* below. **Until this runs, the compliance score and Regulations page are meaningless.** |
| `systems = 0` | `python -m graph.apply_schema` then `python -m graph.run_scan_and_write OWNER/REPO --yes` on a repo you own |
| `neo4j_connected: false` | See B1-FAIL below |
| all four non-zero | Done — go to B2 |

### Expected DPDP output — a partial failure here is normal

A healthy run looks like this, and takes a few minutes (a Gemini pass over 44 sections):

```
44 sections found (sections 1-44).
Extraction will cost ~22 Gemini API calls (batches of 2), ~1.8 min at 12 RPM.
Batch failed (attempt 1/3): Extractor returned 4 results for 2 sections — retrying...
Extraction batch failed after 3 attempts, marking for manual review
17/44 sections identified as data-governing.
2 sections need manual review (extraction failed).
Wrote to Neo4j: {'written': 22, ...}
```

> **Since the Phase A4 fix this should no longer happen.** Results are now matched back by
> section number instead of list position, so a section the model splits into sub-provisions
> is absorbed rather than dropped. The cache means you will not see the difference until you
> re-run with `--refresh`. If you still get failures after that, tell me which sections.

**The 2 failures were sections 43 and 44 — and they did not matter.** Section 43 is "Power to
remove difficulties"; section 44 is "Amendments to certain Acts", which amends the TRAI, IT and
RTI Acts. Neither governs personal data. Gemini returns 4 results for 2 sections because it
splits section 44 into its separate embedded amendments, and the extractor's strict positional
count check can't absorb that. Known issue, queued for Phase A4; **substantively you lose
nothing.**

Results are cached to `legal\.cache\dpdp_clauses.json`, so **re-runs are instant** unless you
pass `--refresh`. That also means your demo no longer depends on a live URL.

> If it fails with *"No sections matched _SECTION_RE"*, the source PDF layout is wrong, not the
> regex. `python ..\smoke\dump_act.py` (from `intelligence\`) fetches every configured source,
> writes the extracted text to `smoke\`, and prints how many sections each one parses.

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

Open `D:\niamm\Niam\backend\.env` in VS Code and set:

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
> cd D:\niamm\Niam\intelligence
> python ..\smoke\check_repo_access.py niacomplianceos/niam-smoke-repo   # all four must be 200
> python -m ingestion.github.scan_remote_repo niacomplianceos/niam-smoke-repo
> ```
> Run the access check **first** — rotating the PAT is exactly when a repo drops out of the
> token's *Only select repositories* list, and the symptom is a 404 that looks like a typo.
> No `--write` flag, so nothing reaches any database. It should print a candidate summary.
> - ❌ Gemini errors → `python -m ingestion.github.smoke_test`. AI Studio keys start `AIza…`.
>   Fix it in `.env` yourself; don't paste the key.

---

# Smoke Check A — after Claude's security fixes

> ### ⚠️ `mock-token-123` no longer works (D1 closed, 2026-09-02)
> Every `curl.exe -H "Authorization: Bearer mock-token-123"` below is
> historical. The bypass is deleted; protected routes need a real JWT.
> To get one:
> ```powershell
> $body = '{"email":"you@example.com","password":"choose-one","name":"You"}'
> $r = curl.exe -s -X POST -H "Content-Type: application/json" -d $body http://localhost:8001/api/v1/auth/signup | ConvertFrom-Json
> $tok = $r.access_token
> curl.exe -s -H "Authorization: Bearer $tok" http://localhost:8001/api/v1/gaps
> ```
> Sign up once per database — the smoke container and Aura each hold their
> own `:User` nodes, and wiping the smoke DB deletes its accounts.

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
cd D:\niamm\Niam\backend
uvicorn app.main:app --port 8002 --host 127.0.0.1
```
Expect a refusal or a loud warning, and `Bearer mock-token-123` to return **401** on :8002.
Close that window afterwards so `APP_ENV` doesn't linger.

**5. The A3 regression test — the one most likely to catch a bad fix.** Wipe the smoke DB so it
has zero `:DPDPClause` nodes, then check the dashboard still returns *real zeros* rather than
"Graph unreachable":
```powershell
docker compose down -v; docker compose up -d neo4j

# WAIT for Bolt to actually accept connections. A fixed Start-Sleep is not
# enough -- Neo4j 5 takes 30-45s, and querying too early returns a genuine
# "Graph unreachable", which looks exactly like the bug this test is for.
foreach ($i in 1..40) {
  try { Invoke-WebRequest http://localhost:7474 -UseBasicParsing -TimeoutSec 2 | Out-Null
        Write-Host "neo4j ready" -ForegroundColor Green; break }
  catch { Start-Sleep -Seconds 3 }
}

curl.exe -s -w "`nHTTP %{http_code}`n" -H "Authorization: Bearer mock-token-123" `
  http://localhost:8001/api/v1/dashboard/summary
```
An empty graph must read as **zeros**, not as an outage — every stat card should
show `0`, not `—` with `"Graph unreachable"`.

> If it still reports unreachable with the database confirmed up, the Cypher itself is
> suspect. Settle it in <http://localhost:7474>:
> ```cypher
> RETURN COUNT { MATCH (s:System) } AS systems,
>        COUNT { MATCH (d:DataType) } AS data_types
> ```
> A row of zeros means the query is fine and the fault is elsewhere; an error means
> `COUNT {}` is unsupported on this server version and needs rewriting.

**6.** Confirm `POST /gaps/{id}/open-pr` in DRY_RUN logs its intent in T3 and creates nothing on
GitHub. Check the repo's branch list — there should be no `niam/remediation/*` branch.

**7. Teardown + baseline:**
```powershell
# T5, clean window
cd D:\niamm\Niam\intelligence
Compare-Object (Get-Content ..\smoke\graph_baseline.txt) (python -m retrieval.query_cli summary)
```

---

# Smoke Check C — the honest-UI walkthrough

Run a **second frontend** against the smoke API. **New window, T6:**
```powershell
$Host.UI.RawUI.WindowTitle = "SMOKE-UI"
cd D:\niamm\Niam\frontend
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

**T4 (smoke vars set), from `D:\niamm\Niam\intelligence`:**
```powershell
python -m graph.apply_schema
python -m legal.load_dpdp_clauses --yes
python -m graph.run_scan_and_write niacomplianceos/niam-smoke-repo --system niam-smoke --yes
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
cd D:\niamm\Niam
git remote set-url origin https://github.com/Nia-complianceOS/Niam.git
git remote -v
git fetch
```
GitHub redirects the old URL automatically, so nothing breaks if you forget — but fix it anyway.
*(The org `Nia-complianceOS` stays, per D3.)*

## F4.2 — `package.json` rename
Claude edits the name; you regenerate the lockfile. **T2, after stopping the dev server:**
```powershell
cd D:\niamm\Niam\frontend
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

Renaming `D:\niamm\Niam` **breaks your venv**: Python virtual environments hard-code their
absolute path, so `backend\venv` stops working the moment the folder moves. You must rebuild
it in the same sitting.

**Stop every terminal and VS Code first.** Then:

```powershell
# 1. Rename (from a directory outside the tree)
cd D:\
Rename-Item -Path "D:\niam" -NewName "niam"
Rename-Item -Path "D:\niamm\NIA" -NewName "Niam"
# result: D:\niamm\Niam

# 2. Delete the now-broken venv
cd D:\niamm\Niam
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
`D:\\niam\\Niam\\backend\\venv\\Scripts\\python.exe` and will point at nothing:
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
2. Create `D:\niamm\Niam\.env` with the union of the keys, resolving any conflicts yourself.
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
| Scan a repo into the demo graph | T5 | `intelligence\` | `python -m graph.run_scan_and_write OWNER/REPO --yes` |
| Scan without writing anything | T5 | `intelligence\` | `python -m ingestion.github.scan_remote_repo OWNER/REPO` |
| Start the smoke DB | T5 | repo root | `docker compose up -d neo4j` |
| Wipe the smoke DB | T5 | repo root | `docker compose down -v; docker compose up -d neo4j` |
| Start the smoke API | T3 | `backend\` | S3 block, then `uvicorn app.main:app --port 8001 --host 127.0.0.1` |
| Run a smoke scan | T4 | `intelligence\` | S3 block, then `... --system niam-smoke --yes` |
| Check a window is Aura-safe | any | anywhere | `if ($env:NEO4J_URI) { "CONTAMINATED" } else { "clean" }` |
| Confirm Aura wasn't touched | T5 | `intelligence\` | `Compare-Object (Get-Content ..\smoke\graph_baseline.txt) (python -m retrieval.query_cli summary)` |
| Diagnose a scan 404 | any | `intelligence\` | `python ..\smoke\check_repo_access.py OWNER/REPO` |
| Diagnose a DPDP parse failure | any | `intelligence\` | `python ..\smoke\dump_act.py` |
| Check which Python is active | any | anywhere | `python -c "import sys; print(sys.executable)"` |
| Check the Docker engine | any | anywhere | `docker info *> $null; $LASTEXITCODE` (0 = up) |
| Re-run the full pre-flight | any | anywhere | `D:\niamm\Niam\smoke\preflight.ps1` |

---

# Phase I — Deployment

Written 2026-08-31, after the scope changed: this is a six-month hackathon
judged on a production-grade result, and the project will be deployed and
linked publicly. That invalidates the premise behind **D1** ("dummy auth stays
— hackathon, no real customers"). Read §I.0 before doing anything else here.

## I.0 — What must be true before a public URL exists

**This is not optional and it is not a config toggle.**

`deps.py` accepts the bypass token only when `APP_ENV == "development"`. So a
public deployment has exactly two states today, and both are unacceptable:

| `APP_ENV` | What happens |
|---|---|
| `development` | Anyone who finds the URL can `POST /api/v1/gaps/{id}/open-pr` and write to your GitHub with your token. |
| anything else | The bypass closes. `AuthContext.tsx` never calls `/auth/login`, so nobody can sign in and the app is unusable. |

**The good news is that this is much smaller than it looks.** The real JWT
machinery in `core/auth.py` is complete and correct, and `services/user_service.py`
already stores `:User` nodes in Neo4j with hashed passwords — there is no
missing database. What is missing is only the frontend call:
`AuthContext.login()` and `signup()` set `mock-token-123` directly instead of
posting to `/api/v1/auth/login` and `/auth/signup`. Wiring those two functions
to the real endpoints, storing the returned JWT, and deleting the bypass from
`deps.py` is an afternoon, not a sprint.

Do that first. Everything below assumes it is done.

## I.1 — Where each piece goes, and why

| Piece | Host | Why |
|---|---|---|
| Frontend (Vite build) | **Vercel** | Static output. Zero config, free, instant previews per branch. |
| Backend (FastAPI) | **Render** | Needs a long-lived process — see below. |
| Graph | **Neo4j Aura** | Already there. |

**The backend cannot go on Vercel or GitHub Pages, and this is not a
preference.** GitHub Pages serves static files only. Vercel runs Python as
serverless functions, which breaks this backend in three specific ways:

1. `POST /scan` uses FastAPI `BackgroundTasks` writing to an in-memory `SCANS`
   dict. A serverless function is frozen once it returns a response, so the
   scan dies mid-flight.
2. `GET /scan/{id}/events` holds an SSE connection open for the length of a
   scan — 90 seconds on the smoke fixtures, longer on a real repository.
   Serverless execution limits cut that off.
3. A second invocation may land on a different instance that has never heard of
   that `scan_id`, so even a completed scan returns 404.

Render (or Railway, or Fly) runs an actual container that stays up. Render's
free tier sleeps after 15 minutes idle and takes ~50s to wake — fine for a demo
link, worth the paid tier before judging.

## I.2 — Fix the backend Dockerfile first

`backend/Dockerfile` builds with `backend/` as its context and does `COPY . .`.
That works **only** because `backend/` still holds the duplicated intelligence
tree. The moment Phase G1 deletes those copies, every deployed build breaks with
`ModuleNotFoundError: No module named 'graph'`, and it will break in CI rather
than on your machine.

Move the Dockerfile to the repository root and build from there, so the real
package is installed rather than copied:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY intelligence/ ./intelligence/
RUN pip install --no-cache-dir -e ./intelligence
COPY backend/ ./backend/
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

Note `${PORT}` — Render assigns the port at runtime and a hardcoded 8000 fails
its health check.

## I.3 — Backend on Render

1. <https://dashboard.render.com> → **New** → **Web Service** → connect the
   `Nia-complianceOS/Niam` repo.
2. Root directory: **repository root** (not `backend/`). Runtime: **Docker**.
3. Health check path: `/api/v1/health`.
4. Environment variables — set these in the dashboard, never in the repo:

   | Key | Value |
   |---|---|
   | `APP_ENV` | `production` |
   | `DEBUG` | `false` |
   | `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` | from Aura |
   | `GEMINI_API_KEY` | |
   | `GITHUB_TOKEN` | fine-grained, demo repos only |
   | `JWT_SECRET` | a long random string, different from local |
   | `GITHUB_WEBHOOK_SECRET` | |
   | `GITHUB_DRY_RUN` | `true` until you deliberately want real PRs |
   | `PR_ALLOWED_REPOS` | the exact repos it may write to |
   | `CORS_ORIGINS` | your Vercel URL, comma-separated |

5. Deploy, then confirm `https://<service>.onrender.com/api/v1/health` returns
   `neo4j_connected: true`.

`backend/render.yaml` already declares most of this; it is only read if you use
Render's Blueprint flow.

## I.4 — Frontend on Vercel

1. <https://vercel.com/new> → import the same repo.
2. Root directory: `frontend`. Framework preset: **Vite** (auto-detected).
3. Environment variable: `VITE_API_BASE_URL` =
   `https://<your-render-service>.onrender.com/api/v1`.
4. Deploy, then go back to Render and put the Vercel URL into `CORS_ORIGINS`.
   Missing this is the classic first-deploy failure: the site loads, every API
   call fails, and the browser console shows a CORS error rather than anything
   about your code.

Vite bakes `VITE_*` variables in at **build** time, so changing that variable
requires a redeploy, not a restart.

## I.5 — Before you put the link on a résumé

- **Aura Free pauses when idle and is deleted after 30 days of inactivity.** A
  paused instance makes the whole site read "Graph unreachable". For something
  people will click at unpredictable times, budget for Aura Professional.
- **Rate-limit the scan endpoint.** It burns Gemini quota and GitHub API calls
  per request, and it will be publicly reachable.
- **Keep `GITHUB_DRY_RUN=true`** unless you are actively demonstrating a real
  pull request.
- Seed the demo graph so a first-time visitor sees something. An honest empty
  state is correct behaviour and a poor first impression.
- Rotate `GITHUB_TOKEN` once more after deployment — it will have passed through
  a build log or two.
