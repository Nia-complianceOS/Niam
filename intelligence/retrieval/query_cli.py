"""
retrieval/query_cli.py — manual/demo CLI for the retrieval layer.

Every subcommand takes a required --owner: the account whose subgraph to
read. There is no default -- see smoke/TENANCY_CONTRACT.md. `upcoming` is
the one subcommand whose ANSWER does not depend on it (it reads only the
shared Act), but it still requires the flag, so that no invocation of
this CLI reads the graph without naming who it is reading for.

Examples:
    python -m retrieval.query_cli summary --owner alice@example.com
    python -m retrieval.query_cli for-data-type consent_or_age \
        --owner alice@example.com
    python -m retrieval.query_cli for-system --owner alice@example.com
    python -m retrieval.query_cli for-system --owner alice@example.com \
        --no-upcoming
    python -m retrieval.query_cli gaps --owner alice@example.com
    python -m retrieval.query_cli vendor-exposure DPDP-s6 \
        --owner alice@example.com
    python -m retrieval.query_cli clause DPDP-s9 --owner alice@example.com
    python -m retrieval.query_cli upcoming --owner alice@example.com
    python -m retrieval.query_cli upcoming --owner alice@example.com \
        --within-days 120
"""

import argparse
import json
import sys

from graph.schema import DEFAULT_SYSTEM_NAME
from retrieval.dpdp_retrieval import DPDPRetriever
from graph.neo4j_client import Neo4jClient
from graph.owner import UnknownOwner, resolve_owner_id


def _print(obj):
    print(json.dumps(obj, indent=2, default=str))


def _clause_line(c: dict) -> str:
    marker = "✓" if c.get("status") == "in_force" else "…"
    return f"    {marker} {c['clause_id']:<10} {c.get('title', ''):<45} ({c.get('status')})"


def _print_clauses_summary(clauses: list, label: str = ""):
    """Compact one-line-per-clause view — full obligation_summary text is
    what actually blows past a terminal's scrollback, not the clause list
    itself, so this drops it and shows just id/title/status."""
    in_force = sum(1 for c in clauses if c.get("status") == "in_force")
    upcoming = len(clauses) - in_force
    header = f"{label}: " if label else ""
    print(
        f"{header}{len(clauses)} clause(s) — {in_force} in force, {upcoming} not yet commenced"
    )
    for c in clauses:
        print(_clause_line(c))


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    # Attached to every subparser rather than to the top-level parser, so
    # the flag can be written after the subcommand (`gaps --owner x`)
    # instead of only before it. argparse does not allow a parent
    # parser's options to appear after the subcommand name.
    owner_arg = argparse.ArgumentParser(add_help=False)
    owner_arg.add_argument(
        "--owner",
        required=True,
        help=(
            "account whose subgraph to read -- a user id or the email it "
            "signed up with. Required: there is no default owner, and a "
            "query without one either returns nothing or returns another "
            "account's compliance findings."
        ),
    )

    sub.add_parser(
        "summary",
        parents=[owner_arg],
        help="graph-wide counts and coverage snapshot",
    )

    p = sub.add_parser(
        "for-data-type",
        parents=[owner_arg],
        help="clauses governing one data type",
    )
    p.add_argument("data_type")
    p.add_argument(
        "--no-upcoming", action="store_true", help="only in-force clauses"
    )
    p.add_argument(
        "--no-general",
        action="store_true",
        help="exclude general-purpose 'other_personal_data' clauses",
    )
    p.add_argument(
        "--summary",
        action="store_true",
        help="compact one-line-per-clause view instead of full JSON",
    )

    p = sub.add_parser(
        "for-system",
        parents=[owner_arg],
        help="clauses for every data type a system collects",
    )
    p.add_argument("--system", default=DEFAULT_SYSTEM_NAME)
    p.add_argument("--no-upcoming", action="store_true")
    p.add_argument(
        "--no-general",
        action="store_true",
        help="exclude general-purpose 'other_personal_data' clauses",
    )
    p.add_argument(
        "--summary",
        action="store_true",
        help="compact one-line-per-clause view instead of full JSON",
    )

    p = sub.add_parser(
        "gaps",
        parents=[owner_arg],
        help="collected data types with zero governing clauses",
    )
    p.add_argument("--system", default=DEFAULT_SYSTEM_NAME)
    p.add_argument(
        "--no-general",
        action="store_true",
        help="stricter reading: only exact-name clause matches count as coverage",
    )

    p = sub.add_parser(
        "vendor-exposure",
        parents=[owner_arg],
        help="vendors touching data governed by a clause",
    )
    p.add_argument("clause_id", help="e.g. DPDP-s6")

    p = sub.add_parser(
        "clause", parents=[owner_arg], help="full detail for one clause"
    )
    p.add_argument("clause_id", help="e.g. DPDP-s9")

    p = sub.add_parser(
        "upcoming",
        parents=[owner_arg],
        help="not-yet-commenced clauses, soonest first",
    )
    p.add_argument("--within-days", type=int, default=None)

    args = parser.parse_args()


    # An email is what a person types; a uuid is what the app scopes by.
    # Resolving here means an owner that matches no account fails now,
    # loudly, instead of producing a correct subgraph nobody can see.
    try:
        args.owner = resolve_owner_id(Neo4jClient(), args.owner)
    except UnknownOwner as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
    retriever = DPDPRetriever()
    try:
        if args.command == "summary":
            _print(retriever.graph_summary(args.owner))

        elif args.command == "for-data-type":
            try:
                clauses = retriever.clauses_for_data_type(
                    args.owner,
                    args.data_type,
                    include_upcoming=not args.no_upcoming,
                    include_general=not args.no_general,
                )
            except ValueError as exc:
                print(f"Error: {exc}")
                sys.exit(1)
            if args.summary:
                _print_clauses_summary(clauses, label=args.data_type)
            else:
                _print(clauses)

        elif args.command == "for-system":
            by_data_type = retriever.clauses_for_system(
                args.owner,
                args.system,
                include_upcoming=not args.no_upcoming,
                include_general=not args.no_general,
            )
            if args.summary:
                for data_type, clauses in sorted(by_data_type.items()):
                    _print_clauses_summary(clauses, label=data_type)
                    print()
            else:
                _print(by_data_type)

        elif args.command == "gaps":
            gaps = retriever.coverage_gaps(
                args.owner,
                args.system,
                include_general=not args.no_general,
            )
            if gaps:
                print(
                    f"{len(gaps)} data type(s) with no governing clause at all:"
                )
                _print(gaps)
            else:
                print(
                    "No coverage gaps — every collected data type has at least one clause."
                )

        elif args.command == "vendor-exposure":
            _print(
                retriever.vendor_exposure_for_clause(
                    args.owner, args.clause_id
                )
            )

        elif args.command == "clause":
            detail = retriever.clause_detail(args.owner, args.clause_id)
            if detail is None:
                print(f"No clause found with id {args.clause_id!r}.")
                sys.exit(1)
            _print(detail)

        elif args.command == "upcoming":
            # No owner passed on purpose: this reads only :DPDPClause,
            # the shared Act. The flag is still required above so that
            # every invocation names an account, but forwarding it here
            # would imply a filter that does not exist.
            _print(retriever.upcoming_clauses(within_days=args.within_days))
    finally:
        retriever.close()


if __name__ == "__main__":
    main()
