"""
Finding backend/.env, from any working directory.

Every module here used to do:

    load_dotenv(find_dotenv("../backend/.env", usecwd=True))

which resolves only when the current directory is `intelligence/`. Run the
exact same command from the repository root -- the obvious place to stand,
and where the runbook's own copy-paste blocks put you -- and find_dotenv
looks for `<root>/../backend/.env`, finds nothing, walks up, finds nothing,
and returns "". load_dotenv("") is not an error; it loads nothing and
returns quietly.

The failure then surfaces several frames later as

    ValueError: Missing Neo4j credentials. Expected NEO4J_URI ...

which sends you to look at a .env file that is completely fine.

The file's location relative to THIS module never changes, so it is
computed rather than searched: intelligence/graph/env.py -> ../.. is the
repository root.
"""

import logging
import os
from pathlib import Path

from dotenv import find_dotenv, load_dotenv

logger = logging.getLogger(__name__)

# intelligence/graph/env.py -> intelligence/graph -> intelligence -> root
_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_ENV = _REPO_ROOT / "backend" / ".env"

_loaded = False


def load_env() -> str | None:
    """Load backend/.env once. Returns the path used, or None.

    Order: an explicit NIAM_ENV_PATH (or the legacy NIA_ENV_PATH), then
    the computed backend/.env, then a search from the current directory
    for anyone with an unusual layout. Real environment variables always
    win over the file -- python-dotenv does not override what is already
    set -- which is what lets a window point itself at a local database
    without touching anything on disk.
    """
    global _loaded
    if _loaded:
        return None

    explicit = os.getenv("NIAM_ENV_PATH") or os.getenv("NIA_ENV_PATH")
    if explicit:
        path = explicit
    elif _DEFAULT_ENV.is_file():
        path = str(_DEFAULT_ENV)
    else:
        path = find_dotenv("../backend/.env", usecwd=True) or find_dotenv(
            usecwd=True
        )

    if path:
        load_dotenv(path)
        logger.debug("Loaded environment from %s", path)
    else:
        # Not fatal: the environment may be fully populated already, which
        # is normal in Docker and on Render. Callers that need a specific
        # variable still raise their own clear error.
        logger.debug("No .env file found; relying on the environment")

    _loaded = True
    return path or None
