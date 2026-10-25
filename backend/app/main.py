import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.core.exceptions import SecurityRefusalException, ImmutabilityViolationException
from backend.app.db.init_db import init_db
from backend.app.api.auth import router as auth_router
from backend.app.api.documents import router as documents_router
from backend.app.api.grants import router as grants_router
from backend.app.api.audit import router as audit_router
from backend.app.api.telemetry import router as telemetry_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables and database-level immutability triggers on startup
    init_db()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="TrustVault — Cryptographically Enforced Secure Document Exchange with Tamper-Evident Ledger",
    lifespan=lifespan
)

# CORS Configuration for Frontend Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Payload-Checksum-SHA256"]
)

# Security Exception Handlers
@app.exception_handler(SecurityRefusalException)
async def security_refusal_exception_handler(request: Request, exc: SecurityRefusalException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "error_code": "ACCESS_REFUSED"}
    )

@app.exception_handler(ImmutabilityViolationException)
async def immutability_exception_handler(request: Request, exc: ImmutabilityViolationException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "error_code": "IMMUTABILITY_VIOLATION"}
    )

# Include API Routers with /api/v1
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(documents_router, prefix=settings.API_V1_STR)
app.include_router(grants_router, prefix=settings.API_V1_STR)
app.include_router(audit_router, prefix=settings.API_V1_STR)
app.include_router(telemetry_router, prefix=settings.API_V1_STR)

# Also include with /v1 prefix for Vercel serverless functions where /api is stripped
app.include_router(auth_router, prefix="/v1")
app.include_router(documents_router, prefix="/v1")
app.include_router(grants_router, prefix="/v1")
app.include_router(audit_router, prefix="/v1")
app.include_router(telemetry_router, prefix="/v1")

@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
@app.get("/api/v1/health", tags=["Health"])
@app.get("/v1/health", tags=["Health"])
def health_check():
    return {
        "status": "HEALTHY",
        "system": "TrustVault Cryptographic Engine",
        "version": settings.VERSION,
        "tamper_evident_ledger": "ACTIVE",
        "envelope_encryption": "AES-256-GCM"
    }

# Mount built React Frontend if available (at the end so API routes take precedence)
from pathlib import Path
from starlette.staticfiles import StaticFiles
frontend_dist = Path("frontend/dist")
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
