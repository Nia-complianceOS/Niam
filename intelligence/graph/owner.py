"""
Turning what a person types into the owner id the app actually uses.

The CLIs take `--owner`, and the natural thing to type is an email
address. But every query scopes by the account's id, so an owner of
"alice@example.com" would write a complete, correct, and permanently
invisible subgraph: the scan succeeds, the reconciler finds gaps, and
Alice's dashboard stays empty forever because her account is keyed by
something else entirely.

That failure is silent in both directions, which is why this resolves
rather than accepts. An owner that matches no account is refused here, at
the start, instead of discovered later as an empty screen.

WHERE ACCOUNTS LIVE
-------------------
Postgres, via Supabase -- not Neo4j. This module used to run
`MATCH (u:User {id: $value})` against the graph, which was correct until
identity moved out of it. Users, GitHub connections, OAuth states, scan
history and the audit log are relational and now live in Supabase;
Neo4j holds the compliance graph and nothing about people.

After that move, :User nodes stopped being written at all, and
graph/cleanup_migrated.py deletes any that remain. So the old lookup
could only ever return nothing -- which this module reported as "there
are no accounts on this instance yet, sign up in the app first". Every
intelligence CLI refused to run, and said something false about why.
"""

import logging
import os

logger = logging.getLogger(__name__)


class UnknownOwner(Exception):
    """Raised instead of writing a subgraph nobody can see."""


def _client():
    """A Supabase client, or a UnknownOwner explaining what is missing.

    Imported lazily. This package is installed into environments that do
    not all talk to Postgres -- a scanner run, a clause extraction -- and
    a missing dependency should not stop them importing graph.owner.
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise UnknownOwner(
            "SUPABASE_URL and SUPABASE_SECRET_KEY are not set, so --owner "
            "cannot be checked against your accounts. They belong in "
            "backend/.env alongside the NEO4J_* values -- see "
            "backend/.env.example for the key names."
        )
    try:
        from supabase import create_client
    except ImportError as exc:
        raise UnknownOwner(
            "The 'supabase' package is not installed in this environment. "
            "Run: pip install -r backend/requirements.txt"
        ) from exc
    return create_client(url, key)


def resolve_owner_id(value: str) -> str:
    """Accept a user id or an email; return the user id.

    Takes no graph client. It used to, because accounts used to live in
    the graph; keeping the parameter would have meant every CLI opening a
    Neo4j connection, and demanding Neo4j credentials, purely to look up
    something Neo4j no longer knows.
    """
    value = (value or "").strip()
    if not value:
        raise UnknownOwner("--owner is required")

    supabase = _client()

    def _rows(column: str, needle: str):
        try:
            resp = (
                supabase.table("users")
                .select("id, email")
                .eq(column, needle)
                .limit(1)
                .execute()
            )
        except Exception as exc:  # noqa: BLE001
            raise UnknownOwner(
                f"Could not read the accounts table: {exc}"
            ) from exc
        return resp.data or []

    # An id first. A uuid is what the app stores and what a gap id embeds,
    # so it is the value that needs to work without translation.
    found = _rows("id", value) if "@" not in value else []
    if found:
        return found[0]["id"]

    if "@" in value:
        # Case-insensitively: an email is not case-sensitive to a person,
        # and typing Alice@ when you signed up alice@ should not read as
        # "no such account".
        try:
            resp = (
                supabase.table("users")
                .select("id, email")
                .ilike("email", value)
                .limit(1)
                .execute()
            )
            found = resp.data or []
        except Exception as exc:  # noqa: BLE001
            raise UnknownOwner(
                f"Could not read the accounts table: {exc}"
            ) from exc
        if found:
            logger.info("Resolved %s to user id %s", value, found[0]["id"])
            return found[0]["id"]

    # Nothing matched. Say which accounts do exist -- the usual cause is a
    # typo or the wrong instance, and both are obvious from the list.
    try:
        resp = (
            supabase.table("users")
            .select("email")
            .order("email")
            .limit(10)
            .execute()
        )
        known = [r["email"] for r in (resp.data or []) if r.get("email")]
    except Exception:  # noqa: BLE001
        known = []

    if known:
        hint = "Accounts on this instance: " + ", ".join(known)
    else:
        hint = (
            "There are no accounts on this instance yet. Sign up in the app "
            "first -- the CLI writes into an existing account, it does not "
            "create one."
        )
    raise UnknownOwner(f"No account matches --owner {value!r}. {hint}")
