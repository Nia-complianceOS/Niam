import logging
from supabase import create_client, Client
from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client: Client | None = None


def get_supabase() -> Client:
    """Returns a singleton Supabase client instance."""
    global _client
    if _client is not None:
        return _client

    settings = get_settings()
    url = settings.supabase_url
    key = settings.supabase_secret_key

    if not url or not key:
        logger.warning("SUPABASE_URL or SUPABASE_SECRET_KEY is missing. Client may fail to initialize.")

    logger.info("Initializing Supabase client singleton")
    _client = create_client(url, key)
    return _client

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
