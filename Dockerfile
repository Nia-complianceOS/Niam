# Backend image. Built from the REPOSITORY ROOT, not backend/.
#
# The old Dockerfile lived in backend/ and did `COPY . .`, which worked
# only because backend/ held a duplicate copy of the intelligence tree.
# Phase G1 deleted those copies, so that build would now fail at import
# with `ModuleNotFoundError: No module named 'graph'` -- in CI, not on a
# developer's machine, which is the worst place to find out.
#
# Build:  docker build -t niam-backend .
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so a source change doesn't reinstall the world.
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# The intelligence package, installed rather than copied into place. This
# is the whole point of G1: one copy of graph/, ingestion/, legal/,
# reasoning/, reconciliation/ and retrieval/, resolved through the
# installed distribution instead of whatever happens to be on sys.path.
COPY intelligence/ ./intelligence/
RUN pip install --no-cache-dir -e ./intelligence

COPY backend/ ./backend/

WORKDIR /app/backend
EXPOSE 8000

# ${PORT} because Render (and most PaaS) assign the port at runtime; a
# hardcoded 8000 fails the health check.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
