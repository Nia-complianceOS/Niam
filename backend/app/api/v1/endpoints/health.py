from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/")
def root():
    return {
        "status": "running",
        "service": "NIA Backend"
    }


@router.get("/health")
def health():
    return {
        "status": "healthy"
    }