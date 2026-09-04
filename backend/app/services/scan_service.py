import logging

from ingestion.github.scanner import GitHubScanner
from graph.graph_writer import GraphWriter
from reconciliation.reconciler import Reconciler

from app.services import scan_store

logger = logging.getLogger("niam.scan")


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

    State goes to :Scan nodes via scan_store, not to a module-level dict.
    A dict could not survive a restart, could not be read by a second
    instance, and could not be rate-limited against. See scan_store.py.
    """
    try:
        scan_store.set_status(scan_id, "running")
        system_kwargs = {"system_name": system_name} if system_name else {}
        scan_store.append_log(
            scan_id,
            {
                "event": "started",
                "message": (
                    f"Starting scan for {repo_full_name}@{ref} "
                    f"(system: {system_name or 'default'})"
                ),
            },
        )

        scan_store.append_log(
            scan_id, {"event": "scanning", "message": "Running GitHubScanner"}
        )
        scanner = GitHubScanner(repo_full_name=repo_full_name)
        classified_results = scanner.scan_repo_remote(ref=ref, classify=True)

        if classified_results:
            scan_store.append_log(
                scan_id,
                {
                    "event": "writing",
                    "message": "Writing classifier output to Graph",
                },
            )
            writer = GraphWriter(**system_kwargs)
            writer.write_classifier_output(classified_results)
            writer.close()

            scan_store.append_log(
                scan_id,
                {
                    "event": "reconciling",
                    "message": "Reconciling gaps against policy",
                },
            )
            reconciler = Reconciler(**system_kwargs)
            reconciler.find_and_write_gaps()
            reconciler.close()

        scan_store.set_status(scan_id, "completed")
        scan_store.append_log(
            scan_id,
            {"event": "completed", "message": "Scan completed successfully"},
        )
    except Exception as exc:
        logger.error(f"Scan {scan_id} failed: {exc}", exc_info=True)
        try:
            scan_store.set_status(scan_id, "failed", error=str(exc))
            scan_store.append_log(scan_id, {"event": "failed", "error": str(exc)})
        except RuntimeError:
            # The graph is the thing that is down. Nothing left to write to.
            logger.error("Could not record failure for scan %s", scan_id)
