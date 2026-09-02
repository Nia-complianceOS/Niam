"""
node_builder.py — turns raw ingestion records into normalized node dicts
ready for MERGE. No Neo4j calls here — this module is pure data shaping,
easy to unit test without a live database.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import json


@dataclass
class DataTypeNode:
    name: str  # must satisfy schema.validate_data_type


@dataclass
class VendorNode:
    name: str
    category: str = "unknown"  # e.g. "email", "cloud", "payments", "analytics"


@dataclass
class SystemNode:
    name: str


def build_data_type_node(data_type: str) -> DataTypeNode:
    return DataTypeNode(name=data_type.strip().lower())


def build_vendor_node(vendor: str, category: str = "unknown") -> VendorNode:
    return VendorNode(name=vendor.strip(), category=category)


def build_system_node(name: str) -> SystemNode:
    return SystemNode(name=name.strip())


def normalize_classifier_record(record) -> dict:
    """
    Accepts either a dict or an object (mirrors classifier.py's own
    `_as_dict()` pattern noted in the handoff doc — classify_candidates()
    already has to handle both CandidateLine objects and plain dicts from
    scan_repo_remote(classify=False), so graph_writer inherits the same
    dual-input tolerance).

    Expected fields: file_path, line_number, data_type, confidence
        (matches CandidateLine.to_dict() / classify_candidates() output
        exactly — diff_parser.py and classifier.py both use file_path/
        line_number, not file/line)
    Optional: vendor, repo, commit_sha
        vendor is legitimately null for confirmed data-handling code with
        no external vendor involved (e.g. a local DB save) — per
        classifier.py's own docstring: "vendor is free text ... or null
        if no external vendor is involved." Do NOT add vendor back to
        `required` below.
    """
    if not isinstance(record, dict):
        record = record.__dict__

    required = ["file_path", "line_number", "data_type", "confidence"]
    missing = [f for f in required if record.get(f) is None]
    if missing:
        raise ValueError(
            f"classifier record missing required fields: {missing}"
        )

    raw_vendor = record.get("vendor")
    vendor = str(raw_vendor).strip() if raw_vendor else None

    detected_at = datetime.now(timezone.utc).isoformat()
    result = {
        "file_path": record["file_path"],
        "line_number": record["line_number"],
        "data_type": str(record["data_type"]).strip().lower(),
        "vendor": vendor,
        "confidence": float(record["confidence"]),
        "repo": record.get("repo"),
        "commit_sha": record.get("commit_sha"),
        # Resolved by GitHubScanner.resolve_commit() and stamped onto every
        # candidate. Carried through provenance so the reconciler can put a
        # real commit on a :Gap without going back to GitHub -- which is
        # what gives open-pr a target repo and the audit trail a source.
        "commit_message": record.get("commit_message"),
        "commit_author": record.get("commit_author"),
        "commit_branch": record.get("commit_branch"),
        "commit_committed_at": record.get("commit_committed_at"),
        "detected_at": detected_at,
    }
    # Neo4j rejects maps/objects as property values — only primitives and
    # arrays of primitives are allowed. Provenance gets JSON-serialized
    # here so edge_builder.py can append it as a plain string into the
    # `sources` array property, instead of an inline map literal.
    result["source_json"] = json.dumps(
        {
            "origin": "code",
            "file": result["file_path"],
            "line": result["line_number"],
            "repo": result["repo"],
            "commit_sha": result["commit_sha"],
            "commit_message": result["commit_message"],
            "commit_author": result["commit_author"],
            "commit_branch": result["commit_branch"],
            "commit_committed_at": result["commit_committed_at"],
            "confidence": result["confidence"],
            "detected_at": detected_at,
        }
    )
    # Identity of this observation, WITHOUT detected_at. edge_builder
    # dedupes on this. The JSON above can never be compared directly
    # because it carries a fresh timestamp on every run, which is exactly
    # why re-scanning the same repo used to append a duplicate provenance
    # entry to every edge, forever.
    result["source_key"] = (
        f"code|{result['file_path']}|{result['line_number']}"
        f"|{result['commit_sha']}"
    )
    return result


def normalize_vendor_field_record(record: dict) -> dict:
    """
    Expected shape from ingestion/vendors/mapper.py:
        {"vendor": "Stripe", "data_type": "email", "event_type": "customer.created",
         "field_path": "data.object.email"}
    """
    required = ["vendor", "data_type", "event_type", "field_path"]
    missing = [f for f in required if record.get(f) is None]
    if missing:
        raise ValueError(
            f"vendor field record missing required fields: {missing}"
        )

    detected_at = datetime.now(timezone.utc).isoformat()
    result = {
        "vendor": str(record["vendor"]).strip(),
        "data_type": str(record["data_type"]).strip().lower(),
        "event_type": record["event_type"],
        "field_path": record["field_path"],
        "detected_at": detected_at,
    }
    result["source_json"] = json.dumps(
        {
            "origin": "vendor",
            "vendor": result["vendor"],
            "event_type": result["event_type"],
            "field_path": result["field_path"],
            "detected_at": detected_at,
        }
    )
    result["source_key"] = (
        f"vendor|{result['vendor']}|{result['event_type']}"
        f"|{result['field_path']}"
    )
    return result


def normalize_dpdp_clause_record(record: dict, data_type: str) -> dict:
    """
    One row per (clause, data_type) pair — a single Act section can
    govern multiple data types (legal.dpdp_extractor.DPDPClauseExtractor
    returns one record per section with a data_types_governed list), and
    GraphWriter's batch-write pattern expects flat rows, same shape as
    the code/vendor normalizers above. Call once per entry in that list.

    Expected fields on `record` (from DPDPClauseExtractor.extract_clauses()):
        section, title, obligation_summary
    Optional: effective_from, status (from legal/commencement.py — a
        clause not yet in force should still be visible in the graph,
        just clearly marked, not silently omitted).
    """
    required = ["section", "title", "obligation_summary"]
    missing = [f for f in required if record.get(f) is None]
    if missing:
        raise ValueError(
            f"DPDP clause record missing required fields: {missing}"
        )

    return {
        "clause_id": f"DPDP-s{record['section']}",
        "section": str(record["section"]),
        "title": str(record["title"]).strip(),
        "obligation_summary": str(record["obligation_summary"]).strip(),
        "effective_from": record.get("effective_from"),
        "status": record.get("status", "unknown"),
        "data_type": str(data_type).strip().lower(),
    }
