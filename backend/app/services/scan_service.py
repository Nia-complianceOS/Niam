"""
Runs one repository scan end to end: GitHubScanner -> GraphWriter ->
Reconciler, reporting progress into :Scan nodes via scan_store.

TENANCY (smoke/TENANCY_CONTRACT.md). A scan is the single largest write
this system makes -- it creates the :System, :DataType, :Vendor and :Gap
nodes every other page reads -- so it is also the place an owner is most
expensive to get wrong. `owner_id` is the first argument and is passed
straight into GraphWriter and Reconciler, both of which raise ValueError
without one. Before this, both were constructed as `(**system_kwargs)`
with no owner at all, which after the intelligence package became
owner-scoped meant every scan died on a ValueError before writing a
single node.
"""

import logging

from ingestion.github.scanner import GitHubScanner
from graph.graph_writer import GraphWriter
from reconciliation.reconciler import Reconciler

from app.services import github_service, scan_store

logger = logging.getLogger("niam.scan")


def _load_policy_documents(
    owner_id: str,
    scan_id: str,
    writer,
    repo_full_name: str,
    ref: str,
    token: str,
) -> None:
    """Read the repository's own legal documents into the graph.

    This used to exist only as a CLI step (`python -m legal.load_policies`)
    with no route into the product at all. The consequence was quiet and
    bad: reconciliation compares three things -- what the code collects,
    what the Act requires, and what the company has DISCLOSED -- and with
    no :PolicyDocument the reconciler skips the disclosure half entirely
    rather than reporting every data type as undisclosed. So a user who
    only ever used the UI got an empty Policies page, no "shared without
    disclosure" findings, and no error anywhere saying why. Half the
    product was unreachable without a terminal.

    Finding nothing is a normal outcome, not a failure: most repositories
    do not keep their privacy policy in the codebase. It is reported as
    its own event, because "we looked and there was nothing there" is
    genuinely useful to whoever is reading the log -- and it is the answer
    to "why are there no disclosure findings?".

    A failure here never fails the scan. The code-side findings are
    already written and correct; losing them because a policy file could
    not be parsed would be a poor trade.
    """
    from legal import policy_source
    from legal.policy_extractor import PolicyExtractor

    try:
        scan_store.append_log(
            owner_id,
            scan_id,
            {
                "event": "policies",
                "message": "Looking for privacy policy and terms",
            },
        )
        documents = policy_source.load_from_repo(
            repo_full_name, ref=ref, github_token=token
        )
    except Exception as exc:
        logger.warning("Policy discovery failed for %s: %s", repo_full_name, exc)
        scan_store.append_log(
            owner_id,
            scan_id,
            {
                "event": "policies",
                "message": (
                    "Could not read legal documents from this repository; "
                    "continuing with code findings only"
                ),
            },
        )
        return

    if not documents:
        scan_store.append_log(
            owner_id,
            scan_id,
            {
                "event": "policies",
                "message": (
                    "No privacy policy or terms found in this repository — "
                    "disclosure checks will be skipped"
                ),
            },
        )
        return

    names = ", ".join(d["path"] for d in documents)
    try:
        scan_store.append_log(
            owner_id,
            scan_id,
            {
                "event": "policies",
                "message": f"Reading what {names} discloses",
            },
        )
        extracted = PolicyExtractor().extract_all(documents)
        writer.write_policy_documents(extracted)
        scan_store.append_log(
            owner_id,
            scan_id,
            {
                "event": "policies",
                "message": f"Recorded {len(extracted)} legal document(s)",
            },
        )
    except Exception as exc:
        logger.warning("Policy extraction failed for %s: %s", repo_full_name, exc)
        scan_store.append_log(
            owner_id,
            scan_id,
            {
                "event": "policies",
                "message": (
                    "Found legal documents but could not read them; "
                    "continuing with code findings only"
                ),
            },
        )


def run_scan(
    owner_id: str,
    scan_id: str,
    repo_full_name: str,
    ref: str,
    system_name: str | None = None,
):
    """Scan a repo, write it into the graph, then reconcile gaps.

    `owner_id` is the account every node this scan writes belongs to. It
    is required: GraphWriter and Reconciler both refuse to construct
    without one, because an unowned :System is invisible to every user's
    dashboard and an unowned :Gap collides with every other account's
    gap ids (see reconciler.gap_id_prefix).

    `system_name` selects which :System node the results attach to.
    None means the module default (graph.schema.DEFAULT_SYSTEM_NAME).
    Passing an explicit name is how a smoke run stays separable from
    demo data -- both GraphWriter and Reconciler key their writes on it,
    and gap ids are `gap-{owner_id}-{system_name}-...`.

    State goes to :Scan nodes via scan_store, not to a module-level dict.
    A dict could not survive a restart, could not be read by a second
    instance, and could not be rate-limited against. See scan_store.py.
    """
    if not owner_id:
        raise ValueError(
            "run_scan requires owner_id -- a scan with no owner writes "
            "nodes no account can read and gaps that collide with every "
            "other account's"
        )

    try:
        scan_store.set_status(owner_id, scan_id, "running")
        system_kwargs = {"system_name": system_name} if system_name else {}
        # The owner is not part of system_kwargs: it is not optional the
        # way system_name is, so it is passed explicitly at each call
        # site rather than hidden in a dict that could arrive empty.
        scan_store.append_log(
            owner_id,
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
            owner_id,
            scan_id,
            {"event": "scanning", "message": "Running GitHubScanner"},
        )
        # The USER's credentials, not the deployment's. A shared
        # GITHUB_TOKEN here would mean one person's scan reading
        # repositories that belong to whoever issued that PAT -- and
        # opening pull requests as them. get_user_token raises 409 when
        # the account has not connected GitHub yet, which the UI renders
        # as a Connect button rather than a failure.
        token = github_service.get_user_token(owner_id)
        scanner = GitHubScanner(
            repo_full_name=repo_full_name,
            github_token=token,
        )
        classified_results = scanner.scan_repo_remote(ref=ref, classify=True)

        if classified_results:
            scan_store.append_log(
                owner_id,
                scan_id,
                {
                    "event": "writing",
                    "message": "Writing classifier output to Graph",
                },
            )
            writer = GraphWriter(owner_id=owner_id, **system_kwargs)
            writer.write_classifier_output(classified_results)

            _load_policy_documents(
                owner_id, scan_id, writer, repo_full_name, ref, token
            )
            writer.close()

            scan_store.append_log(
                owner_id,
                scan_id,
                {
                    "event": "reconciling",
                    "message": "Reconciling gaps against policy",
                },
            )
            reconciler = Reconciler(owner_id=owner_id, **system_kwargs)
            reconciler.find_and_write_gaps()
            reconciler.close()

        scan_store.set_status(owner_id, scan_id, "completed")
        scan_store.append_log(
            owner_id,
            scan_id,
            {"event": "completed", "message": "Scan completed successfully"},
        )
    except Exception as exc:
        logger.error(f"Scan {scan_id} failed: {exc}", exc_info=True)
        try:
            scan_store.set_status(owner_id, scan_id, "failed", error=str(exc))
            scan_store.append_log(
                owner_id, scan_id, {"event": "failed", "error": str(exc)}
            )
        except RuntimeError:
            # The graph is the thing that is down. Nothing left to write to.
            logger.error("Could not record failure for scan %s", scan_id)
