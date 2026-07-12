"""
FastAPI entrypoint.

Step 1 scope: app boots, CORS is open to the frontend dev server,
and /health proves Neo4j is actually reachable (not just that the
process started). Route modules (graph, gaps, webhook, PR service)
get mounted under app/api/v1/ in later steps — this file just wires
the app together.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.database import close_driver, verify_connectivity

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing eager yet — Neo4j driver is lazy (created on first use).
    yield
    # Shutdown: release the driver cleanly.
    close_driver()


app = FastAPI(
    title="Continuum API",
    description="Backend for the Continuum Compliance Operating System.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
def health_check():
    """
    Liveness + Neo4j connectivity check. If neo4j_connected is false,
    NEO4J_URI/USER/PASSWORD in .env are wrong or AuraDB isn't reachable —
    check that before debugging anything downstream.
    """
    neo4j_ok = verify_connectivity()
    return {
        "status": "ok",
        "environment": settings.app_env,
        "neo4j_connected": neo4j_ok,
    }


@app.get("/", tags=["meta"])
def root():
    return {"service": "continuum-api", "docs": "/docs"}


# Route modules mount here as they're built, e.g.:
# from app.api.v1 import graph, gaps, webhook
# app.include_router(graph.router, prefix=settings.api_v1_prefix)
# app.include_router(gaps.router, prefix=settings.api_v1_prefix)
# app.include_router(webhook.router)  # webhook stays unprefixed: /webhook/github