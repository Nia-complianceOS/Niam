"""
CLI: read the company's legal documents and write what they disclose
into the graph.

    python -m legal.load_policies --repo owner/repo --yes
    python -m legal.load_policies --dir ..\\smoke\\fixtures --yes

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
        "--yes", action="store_true", help="skip the confirmation prompt"
    )
    args = parser.parse_args()

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

    writer = GraphWriter()
    try:
        result = writer.write_policy_documents(extracted)
    finally:
        writer.close()

    print(f"\nWrote to Neo4j: {result}")
    print(
        "\nNow re-run reconciliation to pick up disclosure gaps:\n"
        "  python -m reconciliation.run_reconciliation --yes"
    )


if __name__ == "__main__":
    sys.exit(main())
