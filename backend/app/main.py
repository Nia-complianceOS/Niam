"""
FastAPI entrypoint.

All actual routes live under app/api/v1/endpoints/, aggregated by
app/api/v1/router.py. This file just builds the app, sets up CORS,
manages the Neo4j driver lifecycle, and mounts that router.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.database import close_driver

logger = logging.getLogger("niam.main")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing eager -- Neo4j driver is lazy (created on first use).
    # The auth bypass is gone (see app/api/deps.py); every protected route
    # now requires a real JWT. What is still worth shouting about is a
    # deployment running on the default signing key, which would let
    # anybody mint their own valid token.
    if settings.jwt_secret == "dev-secret-do-not-use-in-prod":
        logger.warning(
            "JWT_SECRET is unset and using the default development value. "
            "Anyone who knows it can forge a valid token. Set a long random "
            "JWT_SECRET before exposing this instance (APP_ENV=%s).",
            settings.app_env,
        )
    else:
        logger.info("Auth enabled (APP_ENV=%s).", settings.app_env)
    yield
    # Shutdown: release the driver cleanly.
    close_driver()


app = FastAPI(
    title="Niam API",
    description="Backend for the Niam DPDP readiness platform.",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled: %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["meta"])
def root():
    return {
        "service": "niam-api",
        "docs": "/docs",
        "api_prefix": settings.api_v1_prefix,
    }
