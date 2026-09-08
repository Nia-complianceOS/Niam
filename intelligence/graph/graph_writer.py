"""
graph_writer.py — the module named as "suggested next step" in the
Track-1 handoff doc. Takes:

  - classifier.py output: records shaped like
        {file, line, data_type, vendor, confidence, repo?, commit_sha?}
  - vendor mapper output (e.g. ingestion/vendors/stripe.py + mapper.py):
        {vendor, data_type, event_type, field_path}

...and writes both into the same Neo4j graph as:

    (System)-[:COLLECTS]->(DataType)-[:SENT_TO]->(Vendor)

matching the shape specified in the handoff doc's "Suggested next step"
section (there called (User)->(DataType)->(Vendor); relabeled System
here — see schema.py docstring for why).

Batched via UNWIND (see neo4j_client.run_write_batch) so a 200-candidate
scan is a handful of round trips, not 200.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from graph.neo4j_client import Neo4jClient
from graph.node_builder import (
    normalize_classifier_record,
    normalize_vendor_field_record,
    normalize_dpdp_clause_record,
)
from graph.schema import DEFAULT_SYSTEM_NAME, scoped_uid, validate_data_type
from graph.edge_builder import (
    MERGE_POLICY_DOCUMENT,
    MERGE_COLLECTS_FROM_CODE,
    MERGE_SENT_TO_FROM_CODE,
    MERGE_COLLECTS_FROM_VENDOR,
    MERGE_SENT_TO_FROM_VENDOR,
    MERGE_GOVERNED_BY_FROM_CLAUSE,
    LINK_CLAUSES_FOR_OWNER,
)

logger = logging.getLogger(__name__)

BATCH_SIZE = 200


class GraphWriter:
    def __init__(
        self,
        client: Optional[Neo4jClient] = None,
        system_name: str = DEFAULT_SYSTEM_NAME,
        owner_id: str | None = None,
    ):
        """`owner_id` is the account this write belongs to, and it is
        required. Every :System, :DataType, :Vendor and :PolicyDocument
        this writer touches is keyed by it, so a write without one would
        produce nodes that no user's queries can ever match -- invisible
        to everyone and belonging to nobody. Refusing here is better than
        discovering it as an empty dashboard.
        """
        if not owner_id:
            raise ValueError(
                "GraphWriter requires owner_id -- unowned nodes are "
                "invisible to every account"
            )
        self.client = client or Neo4jClient()
        self.system_name = system_name
        self.owner_id = owner_id

    def _stamp_owner(self, row: dict) -> dict:
        """Attach the owner and the scoped MERGE keys to one row.

        The uids are computed here, in Python, rather than concatenated in
        Cypher, so schema.scoped_uid() is the single definition of how a
        key is shaped. The writer, the reconciler and the backend's read
        queries must agree on it exactly; if they drift, a user gets a
        silently empty graph rather than an error.
        """
        row["owner_id"] = self.owner_id
        row["system"] = self.system_name
        row["system_uid"] = scoped_uid(self.owner_id, self.system_name)
        if row.get("data_type"):
            row["data_type_uid"] = scoped_uid(self.owner_id, row["data_type"])
        if row.get("vendor"):
            row["vendor_uid"] = scoped_uid(self.owner_id, row["vendor"])
        return row

    def link_clauses(self) -> int:
        """Materialise (:DataType)-[:GOVERNED_BY]->(:DPDPClause) for this
        owner.

        The Act is loaded once for everyone -- see edge_builder's note on
        MERGE_DPDP_CLAUSE -- so the edge from a user's own data types to
        the shared clauses has to be created after those data types
        exist. Idempotent; cheap; called at the end of every write that
        can create data types.
        """
        rows = self.client.run_write(
            LINK_CLAUSES_FOR_OWNER, {"owner_id": self.owner_id}
        )
        linked = rows[0]["linked"] if rows else 0
        logger.info("Linked %d GOVERNED_BY edge(s) for %s", linked, self.owner_id)
        return linked

    # --- code-scan ingestion --------------------------------------------

    def write_classifier_output(self, records: list) -> dict:
        """
        records: output of classifier.py's classify_candidates() — a list
        of confirmed (yes/no already resolved to yes) candidates. This
        function does NOT filter on confidence; if you want a minimum-
        confidence cutoff before it hits the graph, filter before calling.
        """
        normalized, skipped_invalid_taxonomy, skipped_malformed = [], [], []

        for raw in records:
            try:
                row = normalize_classifier_record(raw)
            except ValueError as exc:
                # One malformed record (missing field, bad type, etc.)
                # should never take down the whole batch — same
                # fail-closed-per-item pattern the vendor mappers use.
                skipped_malformed.append({"record": raw, "error": str(exc)})
                continue
            if not validate_data_type(row["data_type"]):
                # Same fail-closed principle as classifier.py's
                # _validate_taxonomy() — don't silently write an
                # unrecognized data_type into the graph, it becomes a
                # messy near-duplicate node exactly like the doc warns
                # against for the LLM side.
                skipped_invalid_taxonomy.append(row)
                continue
            normalized.append(self._stamp_owner(row))

        if skipped_malformed:
            logger.warning(
                "Skipped %d classifier record(s) that failed normalization: %s",
                len(skipped_malformed),
                [s["error"] for s in skipped_malformed],
            )

        if skipped_invalid_taxonomy:
            logger.warning(
                "Skipped %d classifier records with data_type outside "
                "DATA_TYPE_TAXONOMY — likely means schema.py's taxonomy is "
                "out of sync with classifier.py's ALLOWED_DATA_TYPES: %s",
                len(skipped_invalid_taxonomy),
                sorted({r["data_type"] for r in skipped_invalid_taxonomy}),
            )

        # SENT_TO only makes sense when a vendor was actually detected —
        # writing it for vendor=None rows would MERGE a null-named Vendor
        # node (edge_builder's MERGE_SENT_TO_FROM_CODE keys on row.vendor).
        with_vendor = [r for r in normalized if r["vendor"] is not None]

        written = 0
        for batch in _chunks(normalized, BATCH_SIZE):
            self.client.run_write_batch(MERGE_COLLECTS_FROM_CODE, batch)
            written += len(batch)
        for batch in _chunks(with_vendor, BATCH_SIZE):
            self.client.run_write_batch(MERGE_SENT_TO_FROM_CODE, batch)

        # The user's data types may be new, so their clause edges do not
        # exist yet. Without this the dashboard reports every data type as
        # ungoverned on a first scan.
        self.link_clauses()

        logger.info(
            "Wrote %d code-scan candidates into graph (%d with a vendor edge)",
            written,
            len(with_vendor),
        )
        return {
            "written": written,
            "skipped_invalid_taxonomy": len(skipped_invalid_taxonomy),
            "skipped_malformed": len(skipped_malformed),
        }

    # --- vendor ingestion (Stripe etc.) ---------------------------------

    def write_vendor_fields(self, records: list) -> dict:
        """
        records: output of ingestion/vendors/mapper.py — one row per
        (vendor field -> data_type) mapping discovered during vendor
        schema ingestion.
        """
        normalized, skipped_invalid_taxonomy, skipped_malformed = [], [], []

        for raw in records:
            try:
                row = normalize_vendor_field_record(raw)
            except ValueError as exc:
                # Same fail-closed-per-item pattern as
                # write_classifier_output(). Without this, a single
                # malformed row raised and discarded the entire vendor
                # ingestion run.
                skipped_malformed.append({"record": raw, "error": str(exc)})
                continue
            if not validate_data_type(row["data_type"]):
                skipped_invalid_taxonomy.append(row)
                continue
            normalized.append(self._stamp_owner(row))

        if skipped_invalid_taxonomy:
            logger.warning(
                "Skipped %d vendor field records with data_type outside "
                "DATA_TYPE_TAXONOMY: %s",
                len(skipped_invalid_taxonomy),
                sorted({r["data_type"] for r in skipped_invalid_taxonomy}),
            )

        written = 0
        for batch in _chunks(normalized, BATCH_SIZE):
            self.client.run_write_batch(MERGE_COLLECTS_FROM_VENDOR, batch)
            self.client.run_write_batch(MERGE_SENT_TO_FROM_VENDOR, batch)
            written += len(batch)

        if skipped_malformed:
            logger.warning(
                "Skipped %d malformed vendor field record(s): %s",
                len(skipped_malformed),
                [s["error"] for s in skipped_malformed],
            )

        self.link_clauses()
        logger.info("Wrote %d vendor field mappings into graph", written)
        return {
            "written": written,
            "skipped_invalid_taxonomy": len(skipped_invalid_taxonomy),
            "skipped_malformed": len(skipped_malformed),
        }

    def close(self):
        self.client.close()

    # --- DPDP clause loader ----------------------------------------------

    def write_dpdp_clauses(self, extracted_clauses: list) -> dict:
        """
        extracted_clauses: output of
        legal.dpdp_extractor.DPDPClauseExtractor.extract_clauses() — one
        dict per Act section, each carrying a data_types_governed list.
        Fans each section out into one row per governed data type before
        writing (a DPDPClause node itself has one canonical text; the
        fan-out only happens on the DataType-side edge).
        """
        rows = []
        skipped_invalid_taxonomy, skipped_malformed, skipped_not_governing = (
            [],
            [],
            [],
        )

        for record in extracted_clauses:
            if not record.get("is_data_governing"):
                skipped_not_governing.append(record.get("section"))
                continue
            for dtype in record.get("data_types_governed") or []:
                try:
                    row = normalize_dpdp_clause_record(record, dtype)
                except ValueError as exc:
                    skipped_malformed.append(
                        {"record": record, "error": str(exc)}
                    )
                    continue
                if not validate_data_type(row["data_type"]):
                    skipped_invalid_taxonomy.append(row)
                    continue
                rows.append(row)

        if skipped_malformed:
            logger.warning(
                "Skipped %d malformed DPDP clause row(s): %s",
                len(skipped_malformed),
                [s["error"] for s in skipped_malformed],
            )
        if skipped_invalid_taxonomy:
            logger.warning(
                "Skipped %d DPDP clause row(s) with data_type outside taxonomy: %s",
                len(skipped_invalid_taxonomy),
                sorted({r["data_type"] for r in skipped_invalid_taxonomy}),
            )

        written = 0
        for batch in _chunks(rows, BATCH_SIZE):
            self.client.run_write_batch(MERGE_GOVERNED_BY_FROM_CLAUSE, batch)
            written += len(batch)

        logger.info(
            "Wrote %d DataType-GOVERNED_BY-DPDPClause edge(s) (%d sections "
            "skipped as non-data-governing)",
            written,
            len(skipped_not_governing),
        )
        return {
            "written": written,
            "skipped_invalid_taxonomy": len(skipped_invalid_taxonomy),
            "skipped_malformed": len(skipped_malformed),
            "skipped_not_governing": len(skipped_not_governing),
        }

    # --- policy document ingestion -------------------------------------

    def write_policy_documents(self, documents: list) -> dict:
        """Write the company's own legal documents and what they disclose.

        `documents` is legal.policy_extractor.PolicyExtractor.extract_all()
        output. Data types outside DATA_TYPE_TAXONOMY are dropped with a
        warning rather than written -- same fail-closed rule the code
        scanner uses, so a hallucinated category cannot enter the graph
        and quietly satisfy a disclosure requirement.
        """
        now = datetime.now(timezone.utc).isoformat()
        rows, skipped_invalid = [], []

        for doc in documents:
            disclosed, bad = [], []
            for dt in doc.get("data_types_disclosed") or []:
                name = str(dt).strip().lower()
                (disclosed if validate_data_type(name) else bad).append(name)
            skipped_invalid.extend(bad)

            repo = doc.get("repo") or ""
            rows.append(
                {
                    # Stable across runs: the same document at the same
                    # path in the same repo is one node, so re-reading an
                    # amended policy updates it rather than adding a twin.
                    # Owner-prefixed: two accounts can both have a
                    # PRIVACY_POLICY.md at the same path in forks of the
                    # same repo, and they are different documents.
                    "id": (
                        f"policy-{self.owner_id}-{repo}-{doc['path']}"
                        .strip("-")
                    ),
                    "owner_id": self.owner_id,
                    "name": doc["path"].rsplit("/", 1)[-1],
                    "path": doc["path"],
                    "kind": doc.get("kind") or "unknown",
                    "repo": repo,
                    "ref": doc.get("ref") or "",
                    "summary": doc.get("summary") or "",
                    "mentions_retention_period": bool(
                        doc.get("mentions_retention_period")
                    ),
                    "mentions_user_rights": bool(
                        doc.get("mentions_user_rights")
                    ),
                    "extraction_ok": bool(doc.get("extraction_ok", True)),
                    # Sent as {uid, name} pairs rather than bare names:
                    # the MERGE keys on the scoped uid, and Cypher must
                    # never build that key itself (see _stamp_owner).
                    "disclosed": [
                        {"uid": scoped_uid(self.owner_id, name), "name": name}
                        for name in disclosed
                    ],
                    "named_recipients": [
                        {"uid": scoped_uid(self.owner_id, v), "name": v}
                        for v in {
                            str(v).strip()
                            for v in (doc.get("vendors_named") or [])
                            if str(v).strip()
                        }
                    ],
                    "updated_at": now,
                }
            )

        if skipped_invalid:
            logger.warning(
                "Dropped %d disclosed data type(s) outside the taxonomy: %s",
                len(skipped_invalid),
                sorted(set(skipped_invalid)),
            )

        for batch in _chunks(rows, BATCH_SIZE):
            self.client.run_write_batch(MERGE_POLICY_DOCUMENT, batch)

        # A policy can disclose a data type the code scan never found, so
        # this write can create data types too.
        self.link_clauses()

        logger.info("Wrote %d policy document(s) into the graph", len(rows))
        return {
            "written": len(rows),
            "skipped_invalid_taxonomy": len(skipped_invalid),
        }


def _chunks(seq: list, size: int):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]
