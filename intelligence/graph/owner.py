"""
Turning what a person types into the owner id the app actually uses.

The CLIs take `--owner`, and the natural thing to type is an email
address. But the API scopes every query by :User.id -- a uuid minted at
signup -- so an owner of "alice@example.com" would write a complete,
correct, and permanently invisible subgraph: the scan succeeds, the
reconciler finds gaps, and Alice's dashboard stays empty forever because
her account is keyed by something else entirely.

That failure is silent in both directions, which is why this resolves
rather than accepts. An owner that matches no account is refused here,
at the start, instead of discovered later as an empty screen.
"""

import logging

logger = logging.getLogger(__name__)

_BY_ID = "MATCH (u:User {id: $value}) RETURN u.id AS id, u.email AS email"
_BY_EMAIL = """
MATCH (u:User)
WHERE toLower(u.email) = toLower($value)
RETURN u.id AS id, u.email AS email
"""
_ANY_USER = "MATCH (u:User) RETURN u.email AS email ORDER BY u.email LIMIT 10"


class UnknownOwner(Exception):
    """Raised instead of writing a subgraph nobody can see."""


def resolve_owner_id(client, value: str) -> str:
    """Accept a user id or an email; return the user id.

    `client` is a graph.neo4j_client.Neo4jClient.
    """
    value = (value or "").strip()
    if not value:
        raise UnknownOwner("--owner is required")

    rows = client.run_read(_BY_ID, {"value": value})
    if rows:
        return rows[0]["id"]

    if "@" in value:
        rows = client.run_read(_BY_EMAIL, {"value": value})
        if rows:
            logger.info("Resolved %s to user id %s", value, rows[0]["id"])
            return rows[0]["id"]

    known = [r["email"] for r in client.run_read(_ANY_USER)]
    if known:
        hint = "Accounts on this instance: " + ", ".join(known)
    else:
        hint = (
            "There are no accounts on this instance yet. Sign up in the app "
            "first -- the CLI writes into an existing account, it does not "
            "create one."
        )
    raise UnknownOwner(f"No account matches --owner {value!r}. {hint}")
