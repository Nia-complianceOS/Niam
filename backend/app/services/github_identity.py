"""
Per-user GitHub credentials.

Until this existed, one GITHUB_TOKEN out of the environment served every
request. That is wrong in a multi-tenant app in three separate ways, and
only the first is obvious:

  1. GET /github/repos listed the repositories of whoever owned that PAT.
     Every user saw the same list -- private repository names belonging
     to a stranger -- and none of them saw their own.
  2. A pull request opened from a gap was authored by that PAT's account,
     so the audit trail on the customer's repository named the wrong
     human. "Who approved this change to the privacy policy" is the one
     question a compliance tool must never answer incorrectly.
  3. A scan could only ever reach repositories that one token could
     reach, which is why the scan panel asked people to type owner/repo
     from memory and then 404'd.

So each user connects their own account, by OAuth (primary) or by
pasting a personal access token (the offline-demo fallback), and every
GitHub call in the backend runs on the token of the user who asked.

TENANCY (smoke/TENANCY_CONTRACT.md). :GithubConnection is an owned label:
it carries `owner_id` for filtering and `uid` = scoped_uid(owner_id,
"github") as its MERGE key, built by graph.schema.scoped_uid() and never
assembled in Cypher. One connection per account, which is what makes the
scoped uid a natural unique key here.

THE TOKEN IS NEVER STORED, LOGGED OR RETURNED IN THE CLEAR. It is
encrypted with core/crypto.py before it reaches the graph, get_token()
is the only function that decrypts it, and get_connection() -- the one
the API serves -- does not read the property at all. If encryption is
unavailable (TOKEN_ENCRYPTION_KEY unset outside development) saving
raises rather than falling back to plaintext.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from graph.schema import scoped_uid

from app.core import crypto
from app.db.database import run_query

logger = logging.getLogger("niam.github.identity")

# How long an OAuth `state` stays usable. This is the window between the
# SPA opening github.com and the browser coming back, so minutes, not
# hours: an unexpired state sitting in the graph is a usable answer to
# "which account should this code be attached to".
STATE_TTL = timedelta(minutes=10)

METHOD_OAUTH = "oauth"
METHOD_TOKEN = "token"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# The uid is the MERGE key; owner_id is SET alongside it so the property
# every read filters on is always present on a node this function wrote.
_UPSERT_CONNECTION = """
MERGE (c:GithubConnection {uid: $uid})
ON CREATE SET c.connected_at = $now
SET c.owner_id = $owner_id,
    c.token_encrypted = $token_encrypted,
    c.login = $login,
    c.avatar_url = $avatar_url,
    c.scopes = $scopes,
    c.method = $method,
    c.updated_at = $now
"""

# No token property in the RETURN. This backs GET /github/connection, and
# a credential that is never selected cannot be accidentally serialised
# into a response model that later grows a passthrough field.
_GET_CONNECTION = """
MATCH (c:GithubConnection {owner_id: $owner_id})
RETURN c.login AS login, c.avatar_url AS avatar_url,
       coalesce(c.scopes, []) AS scopes, c.method AS method,
       c.connected_at AS connected_at
"""

_GET_TOKEN = """
MATCH (c:GithubConnection {owner_id: $owner_id})
RETURN c.token_encrypted AS token_encrypted
"""

_DELETE_CONNECTION = """
MATCH (c:GithubConnection {owner_id: $owner_id})
DELETE c
RETURN count(*) AS deleted
"""

# --- OAuth state ------------------------------------------------------
#
# GET /github/oauth/callback cannot be authenticated: the browser arrives
# from github.com on a top-level navigation, with no Authorization header
# and nothing this backend issued. The `state` IS the identification of
# the user, so it is security-critical rather than CSRF bookkeeping --
# a guessable or reusable state would let anyone attach their own GitHub
# account to somebody else's Niam account, or attach a victim's GitHub
# account to their own. Hence: 256 bits from secrets.token_urlsafe, one
# use (the row is DELETEd as it is read, so a replay finds nothing), and
# a short expiry checked after deletion.
_CREATE_STATE = """
CREATE (s:GithubOAuthState {
    state: $state,
    owner_id: $owner_id,
    created_at: $now,
    expires_at: $expires_at
})
"""

_CONSUME_STATE = """
MATCH (s:GithubOAuthState {state: $state})
WITH s, s.owner_id AS owner_id, s.expires_at AS expires_at
DELETE s
RETURN owner_id, expires_at
"""

# Housekeeping. States are single-use, so the ones left behind are the
# flows a user abandoned; without this they accumulate forever.
_PURGE_STATES = """
MATCH (s:GithubOAuthState)
WHERE s.expires_at < $now
DELETE s
"""


def save_connection(
    owner_id: str,
    token: str,
    login: str,
    avatar_url: str | None,
    scopes: list[str] | None,
    method: str,
) -> None:
    """Store (or replace) this account's GitHub credential, encrypted.

    Raises RuntimeError if encryption is unavailable. The caller turns
    that into a 503 naming TOKEN_ENCRYPTION_KEY -- deliberately louder
    than storing the token in the clear and carrying on.
    """
    if not owner_id:
        raise ValueError(
            "save_connection requires owner_id: a GitHub token stored "
            "against no account is a credential nobody can revoke"
        )
    if not token:
        raise ValueError("save_connection requires a token")

    encrypted = crypto.encrypt(token)

    run_query(
        _UPSERT_CONNECTION,
        {
            "uid": scoped_uid(owner_id, "github"),
            "owner_id": owner_id,
            "token_encrypted": encrypted,
            "login": login or "",
            "avatar_url": avatar_url or "",
            "scopes": list(scopes or []),
            "method": method,
            "now": _now().isoformat(),
        },
    )
    # login, not token. This line ends up in a log aggregator.
    logger.info(
        "Stored GitHub connection for owner %s as @%s (method=%s)",
        owner_id,
        login,
        method,
    )


def get_connection(owner_id: str) -> dict | None:
    """Public metadata about this account's connection, or None.

    Never includes the token, and never can: the query does not select
    it.
    """
    if not owner_id:
        return None
    rows = run_query(_GET_CONNECTION, {"owner_id": owner_id})
    if not rows:
        return None
    row = rows[0]
    return {
        "login": row.get("login") or "",
        "avatar_url": row.get("avatar_url") or None,
        "scopes": [s for s in (row.get("scopes") or []) if s],
        "method": row.get("method") or METHOD_TOKEN,
        "connected_at": row.get("connected_at") or "",
    }


def get_token(owner_id: str) -> str | None:
    """This account's decrypted GitHub token, or None if there is none.

    None covers "never connected" and "stored under a key we no longer
    hold" alike, because both mean the same thing to every caller: ask
    the user to connect. github_service turns it into a 409.
    """
    if not owner_id:
        return None
    rows = run_query(_GET_TOKEN, {"owner_id": owner_id})
    if not rows:
        return None
    return crypto.decrypt(rows[0].get("token_encrypted"))


def delete_connection(owner_id: str) -> bool:
    """Forget this account's credential. True if there was one.

    Note this does not revoke the token at GitHub -- only the user can do
    that, from their account settings -- so the API response says so.
    """
    if not owner_id:
        return False
    rows = run_query(_DELETE_CONNECTION, {"owner_id": owner_id})
    return bool(rows and rows[0].get("deleted"))


def create_state(owner_id: str) -> str:
    """Mint a one-use, expiring OAuth state bound to this account."""
    if not owner_id:
        raise ValueError(
            "create_state requires owner_id: the state is what identifies "
            "the user when the callback arrives unauthenticated"
        )
    now = _now()
    try:
        run_query(_PURGE_STATES, {"now": now.isoformat()})
    except RuntimeError as exc:
        # Housekeeping only. Failing it must not stop a user connecting.
        logger.warning("Could not purge expired OAuth states: %s", exc)

    state = secrets.token_urlsafe(32)
    run_query(
        _CREATE_STATE,
        {
            "state": state,
            "owner_id": owner_id,
            "now": now.isoformat(),
            "expires_at": (now + STATE_TTL).isoformat(),
        },
    )
    return state


def consume_state(state: str) -> str | None:
    """Redeem a state, returning the owner it was issued to, or None.

    None means unknown, already used, or expired -- all of which the
    callback must treat identically: refuse, and say nothing about which
    it was. The row is deleted as part of the same query, so two
    concurrent redemptions of one state cannot both succeed.
    """
    if not state:
        return None
    rows = run_query(_CONSUME_STATE, {"state": state})
    if not rows:
        return None

    row = rows[0]
    expires_at = row.get("expires_at") or ""
    try:
        if datetime.fromisoformat(expires_at) < _now():
            logger.info("Rejected an expired GitHub OAuth state")
            return None
    except (TypeError, ValueError):
        # An unparseable expiry is not a reason to trust the row.
        logger.warning("Rejected an OAuth state with an unreadable expiry")
        return None

    return row.get("owner_id") or None
