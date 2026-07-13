"""
FastAPI entrypoint.

All actual routes live under app/api/v1/endpoints/, aggregated by
app/api/v1/router.py. This file just builds the app, sets up CORS,
manages the Neo4j driver lifecycle, and mounts that router.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.database import close_driver

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing eager -- Neo4j driver is lazy (created on first use).
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

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["meta"])
def root():
    return {"service": "continuum-api", "docs": "/docs", "api_prefix": settings.api_v1_prefix}