"""
CLI: read the company's legal documents and write what they disclose
into the graph.

    python -m legal.load_policies --owner alice@example.com \
        --repo owner/repo --yes
    python -m legal.load_policies --owner alice@example.com \
        --dir ..\\smoke\\fixtures --yes

--owner is required and is NOT the GitHub repo owner: it is the account
whose graph these documents belong to. A privacy policy is a per-company
document, and reading one into an unowned :PolicyDocument node would let
it close another company's disclosure gaps.

Run this before reconciliation. Without it there are no :PolicyDocument
nodes, every collected data type looks undisclosed, and the reconciler
would report a disclosure gap for all of them -- which is technically
true of a company with no privacy policy, and wrong for everyone else.
The reconciler therefore skips disclosure checks entirely when no policy
document exists, rather than flooding the output. See reconciler.py.
"""

import argparse
import logging
import sys

from graph.graph_writer import GraphWriter
from legal import policy_source
from legal.policy_extractor import PolicyExtractor
from graph.neo4j_client import Neo4jClient
from graph.owner import UnknownOwner, resolve_owner_id

logging.basicConfig(
    level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
)


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--repo", help="owner/repo to read policies from")
    source.add_argument("--dir", help="local directory to read policies from")
    parser.add_argument("--ref", default="main", help="branch or tag")
    parser.add_argument(
        "--owner",
        required=True,
        help="account this run belongs to -- a user id or the email it signed up with. Required: there is no default owner, and guessing one writes into somebody else's graph.",
    )
    parser.add_argument(
        "--yes", action="store_true", help="skip the confirmation prompt"
    )
    args = parser.parse_args()


    # An email is what a person types; a uuid is what the app scopes by.
    # Resolving here means an owner that matches no account fails now,
    # loudly, instead of producing a correct subgraph nobody can see.
    try:
        args.owner = resolve_owner_id(Neo4jClient(), args.owner)
    except UnknownOwner as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
    if args.repo:
        documents = policy_source.load_from_repo(args.repo, ref=args.ref)
    else:
        documents = policy_source.load_from_directory(args.dir)

    if not documents:
        print(
            "No legal documents found. Expected a file named like "
            "PRIVACY_POLICY.md or TERMS_OF_SERVICE.md — see "
            "legal/policy_source.py POLICY_FILENAME_HINTS for what is "
            "recognised."
        )
        return

    print(f"\n{len(documents)} document(s) found:")
    for doc in documents:
        kb = len(doc["content"]) / 1024
        print(f"  {doc['path']}  ({doc['kind']}, {kb:.1f} KB)")
    print(f"\nExtraction will cost ~{len(documents)} Gemini API call(s).")

    if not args.yes:
        answer = input("Extract disclosures and write to graph? [y/N] ")
        if answer.strip().lower() != "y":
            print("Stopped.")
            return

    extractor = PolicyExtractor()
    extracted = extractor.extract_all(documents)

    print()
    for doc in extracted:
        disclosed = doc["data_types_disclosed"]
        vendors = doc["vendors_named"]
        print(f"  {doc['path']}")
        print(f"     discloses : {', '.join(disclosed) or '(nothing)'}")
        print(f"     names     : {', '.join(vendors) or '(no vendor named)'}")
        if not doc["extraction_ok"]:
            print("     WARNING: extraction failed — treated as disclosing")
            print("              nothing, so this will over-report gaps.")

    writer = GraphWriter(owner_id=args.owner)
    try:
        result = writer.write_policy_documents(extracted)
    finally:
        writer.close()

    print(f"\nWrote to Neo4j: {result}")
    print(
        "\nNow re-run reconciliation to pick up disclosure gaps:\n"
        f"  python -m reconciliation.run_reconciliation "
        f"--owner {args.owner} --yes"
    )


if __name__ == "__main__":
    sys.exit(main())
