import logging
from functools import lru_cache

from supabase import create_client, Client
from app.core.config import get_settings

logger = logging.getLogger(__name__)

@lru_cache
def get_supabase() -> Client:
    """Returns a cached Supabase client instance."""
    settings = get_settings()
    url = settings.supabase_url
    key = settings.supabase_secret_key

    if not url or not key:
        logger.warning("SUPABASE_URL or SUPABASE_SECRET_KEY is missing. Client may fail to initialize.")

    return create_client(url, key)

def verify_connectivity() -> bool:
    """
    Check if the Supabase client can be initialized and is configured.
    """
    try:
        settings = get_settings()
        if not settings.supabase_url or not settings.supabase_secret_key:
            return False
        client = get_supabase()
        return client is not None
    except Exception as e:
        logger.error(f"Supabase connectivity check failed: {e}")
        return False
