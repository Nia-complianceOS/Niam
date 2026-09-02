import logging
from typing import Any, Dict

from ingestion.github.scanner import GitHubScanner
from graph.graph_writer import GraphWriter
from reconciliation.reconciler import Reconciler

logger = logging.getLogger("niam.scan")

# In-memory scan registry mapping scan_id -> state dict
SCANS: Dict[str, Any] = {}


def append_log(scan_id: str, event_data: dict):
    if scan_id in SCANS:
        SCANS[scan_id]["log"].append(event_data)


def run_scan(
    scan_id: str,
    repo_full_name: str,
    ref: str,
    system_name: str | None = None,
):
    """Scan a repo, write it into the graph, then reconcile gaps.

    `system_name` selects which :System node the results attach to.
    None means the module default (graph.schema.DEFAULT_SYSTEM_NAME).
    Passing an explicit name is how a smoke run stays separable from
    demo data -- both GraphWriter and Reconciler key their writes on it.
    """
    try:
        SCANS[scan_id]["status"] = "running"
        system_kwargs = {"system_name": system_name} if system_name else {}
        append_log(
            scan_id,
            {
                "event": "started",
                "message": (
                    f"Starting scan for {repo_full_name}@{ref} "
                    f"(system: {system_name or 'default'})"
                ),
            },
        )

        append_log(
            scan_id, {"event": "scanning", "message": "Running GitHubScanner"}
        )
        scanner = GitHubScanner(repo_full_name=repo_full_name)
        classified_results = scanner.scan_repo_remote(ref=ref, classify=True)

        if classified_results:
            append_log(
                scan_id,
                {
                    "event": "writing",
                    "message": "Writing classifier output to Graph",
                },
            )
            writer = GraphWriter(**system_kwargs)
            writer.write_classifier_output(classified_results)
            writer.close()

            append_log(
                scan_id,
                {
                    "event": "reconciling",
                    "message": "Reconciling gaps against policy",
                },
            )
            reconciler = Reconciler(**system_kwargs)
            reconciler.find_and_write_gaps()
            reconciler.close()

        SCANS[scan_id]["status"] = "completed"
        append_log(
            scan_id,
            {"event": "completed", "message": "Scan completed successfully"},
        )
    except Exception as exc:
        logger.error(f"Scan {scan_id} failed: {exc}", exc_info=True)
        if scan_id in SCANS:
            SCANS[scan_id]["status"] = "failed"
            SCANS[scan_id]["error"] = str(exc)
            append_log(scan_id, {"event": "failed", "error": str(exc)})
