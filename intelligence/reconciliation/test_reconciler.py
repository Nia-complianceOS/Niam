"""
Tests for the reconciliation engine.

Every clause here carries a `section`, because classify_gap() now asks
whether a clause actually obliges a Data Fiduciary before letting it
count as coverage. s.8 (general obligations) does; s.36 (the Central
Government's power to call for information) does not.

The tenancy tests at the bottom cover the other half: gap identity. They
are unit tests of pure functions on purpose -- the property they check
(every id this engine writes falls under the prefix the stale sweep
uses, and no other account's does) is exactly the kind of thing an
integration test against a single-tenant fixture graph would pass
without ever exercising.
"""

import pytest

from reconciliation.reconciler import classify_gap

OBLIGATION_IN_FORCE = {"section": "8", "status": "in_force"}
OBLIGATION_FUTURE = {"section": "8", "status": "not_yet_commenced"}
# s.36/s.37 are the only sections in force today, and they bind the
# regulator rather than the fiduciary.
REGULATOR_POWER_IN_FORCE = {"section": "36", "status": "in_force"}


def test_classify_gap_ungoverned_egress():
    severity, kind = classify_gap(["Stripe"], [])
    assert (severity, kind) == ("high", "ungoverned_egress")


def test_classify_gap_ungoverned_collection():
    severity, kind = classify_gap([], [])
    assert (severity, kind) == ("low", "ungoverned_collection")


def test_classify_gap_future_obligation_with_egress():
    severity, kind = classify_gap(["Stripe"], [OBLIGATION_FUTURE])
    assert (severity, kind) == ("medium", "future_obligation")


def test_classify_gap_future_obligation_without_egress():
    """Data you hold against a duty that commences in 2027 is a finding.

    This case used to return (None, None) and vanish -- the data type
    never appeared on any inventory, despite being exactly what a
    readiness tool exists to list.
    """
    severity, kind = classify_gap([], [OBLIGATION_FUTURE])
    assert (severity, kind) == ("low", "future_obligation")


def test_classify_gap_no_gap_when_obligation_in_force():
    assert classify_gap(["Stripe"], [OBLIGATION_IN_FORCE]) == (None, None)
    assert classify_gap([], [OBLIGATION_IN_FORCE]) == (None, None)


def test_regulator_powers_do_not_count_as_coverage():
    """The bug that silenced the whole engine.

    ss.36 and 37 are in force and are tagged 'other_personal_data', so
    DPDPRetriever merged them into every data type in the graph. Treating
    them as coverage made all 15 data types read as governed and the
    reconciler wrote zero gaps against a fully populated graph.
    """
    severity, kind = classify_gap(["Stripe"], [REGULATOR_POWER_IN_FORCE])
    assert (severity, kind) == ("high", "ungoverned_egress")

    severity, kind = classify_gap([], [REGULATOR_POWER_IN_FORCE])
    assert (severity, kind) == ("low", "ungoverned_collection")


def test_regulator_power_does_not_mask_a_future_obligation():
    """The realistic shape of this graph: the general merge hands every
    data type both the in-force regulator powers and the substantive
    obligations that have not commenced. The verdict must come from the
    obligation."""
    clauses = [REGULATOR_POWER_IN_FORCE, OBLIGATION_FUTURE]
    severity, kind = classify_gap(["Stripe"], clauses)
    assert (severity, kind) == ("medium", "future_obligation")


def test_clause_with_no_section_does_not_close_a_gap():
    """Unrecognised clauses leave the finding standing. A compliance tool
    should make a human dismiss a gap, not clear one on a guess."""
    severity, kind = classify_gap(["Stripe"], [{"status": "in_force"}])
    assert (severity, kind) == ("high", "ungoverned_egress")


# --- coverage_basis: specific vs general ------------------------------
# DPDPRetriever tags every clause it returns with applies_via. These
# mirror the two shapes it produces.

SPECIFIC = {"section": "9", "status": "not_yet_commenced", "applies_via": "specific"}
GENERAL = {"section": "8", "status": "not_yet_commenced", "applies_via": "general"}
ADMIN_GENERAL = {"section": "36", "status": "in_force", "applies_via": "general"}


def test_coverage_basis_specific_wins():
    from reconciliation.reconciler import coverage_basis
    assert coverage_basis([GENERAL, SPECIFIC]) == "specific"


def test_coverage_basis_general_only():
    from reconciliation.reconciler import coverage_basis
    assert coverage_basis([GENERAL]) == "general"


def test_coverage_basis_ignores_non_obligation_sections():
    """s.36 is in force and applies to all personal data, but it obliges
    the regulator. It must not make a data type look covered."""
    from reconciliation.reconciler import coverage_basis
    assert coverage_basis([ADMIN_GENERAL]) == "none"


def test_coverage_basis_none_when_no_clauses():
    from reconciliation.reconciler import coverage_basis
    assert coverage_basis([]) == "none"


# --- disclosure gaps: what the policy says vs what the code does ------

from reconciliation.reconciler import classify_disclosure_gap  # noqa: E402

DISCLOSED = {"email", "phone"}
NAMED = {"Stripe"}


def test_undisclosed_sharing_is_high():
    """Data leaving for a vendor the policy never names. The data is gone
    and nobody was told, so this outranks a collection that stayed put."""
    assert classify_disclosure_gap(
        "credit_card", "MongoDB", DISCLOSED, NAMED
    ) == ("high", "undisclosed_sharing")


def test_undisclosed_collection_is_medium():
    assert classify_disclosure_gap(
        "government_id", None, DISCLOSED, NAMED
    ) == ("medium", "undisclosed_collection")


def test_disclosed_and_named_is_no_gap():
    assert classify_disclosure_gap("email", "Stripe", DISCLOSED, NAMED) == (
        None,
        None,
    )


def test_named_vendor_still_flags_undisclosed_data_type():
    """Naming Stripe does not disclose the credit card data sent to it.

    The vendor check passes, so the data-type check has to run anyway --
    returning early on a named recipient would let any disclosed vendor
    launder every undisclosed data type sent to it.
    """
    assert classify_disclosure_gap(
        "credit_card", "Stripe", DISCLOSED, NAMED
    ) == ("medium", "undisclosed_collection")


# --- tenancy: gap identity and the stale sweep -------------------------
# See smoke/TENANCY_CONTRACT.md and the gap-identity note in
# reconciler.py. A :Gap id used to be scoped by system name alone, and
# DEFAULT_SYSTEM_NAME is a constant, so every account produced the same
# ids for the same findings.

from reconciliation.reconciler import (  # noqa: E402
    Reconciler,
    build_gap_id,
    gap_id_prefix,
)

OWNER = "alice@example.com"
OTHER_OWNER = "bob@example.com"
SYSTEM = "niam-demo-system"


def test_reconciler_requires_an_owner():
    """No owner, no reconcile -- and it must raise before a Neo4j client
    is ever constructed, so this is safe to run with no database."""
    with pytest.raises(ValueError):
        Reconciler(system_name=SYSTEM)
    with pytest.raises(ValueError):
        Reconciler(system_name=SYSTEM, owner_id="")
    with pytest.raises(ValueError):
        Reconciler(system_name=SYSTEM, owner_id=None)


def test_gap_id_is_owner_scoped():
    """Two accounts, same system, same finding, different ids.

    Without this the second account's reconcile MERGEd onto the first
    account's :Gap node and overwrote its title, severity, source commit
    and remediation path.
    """
    mine = build_gap_id(OWNER, SYSTEM, "email", "Stripe")
    theirs = build_gap_id(OTHER_OWNER, SYSTEM, "email", "Stripe")

    assert mine == "gap-alice@example.com-niam-demo-system-email-Stripe"
    assert mine != theirs


def test_gap_id_is_still_system_scoped():
    """Owner scoping is added to system scoping, not swapped for it."""
    assert build_gap_id(OWNER, "system-a", "email", None) != build_gap_id(
        OWNER, "system-b", "email", None
    )


def test_gap_id_records_a_missing_vendor_explicitly():
    assert build_gap_id(OWNER, SYSTEM, "email", None).endswith("-none")


def test_disclosure_gap_has_its_own_id():
    """An Act finding and a disclosure finding about the same (data type,
    vendor) are different findings. Sharing an id means the second MERGE
    overwrites the first."""
    act = build_gap_id(OWNER, SYSTEM, "email", "Stripe")
    disclosure = build_gap_id(OWNER, SYSTEM, "email", "Stripe", disclosure=True)
    assert act != disclosure
    assert "disclosure" in disclosure


def test_every_written_id_falls_under_the_stale_sweep_prefix():
    """THE test in this file.

    RESOLVE_STALE_GAPS resolves every gap matching the prefix that this
    run did not re-write. If build_gap_id() ever produced a shape the
    prefix does not cover, the sweep would resolve gaps the same run had
    just written -- every finding would flip to 'resolved' the moment it
    was detected.
    """
    prefix = gap_id_prefix(OWNER, SYSTEM)
    for disclosure in (False, True):
        for vendor in ("Stripe", None):
            gap_id = build_gap_id(
                OWNER, SYSTEM, "email", vendor, disclosure=disclosure
            )
            assert gap_id.startswith(prefix)


def test_stale_sweep_prefix_does_not_reach_another_owner():
    """The failure this guards against is not an empty dashboard -- it is
    one account's reconcile silently marking another account's open
    findings 'resolved', erasing an audit trail it does not own."""
    prefix = gap_id_prefix(OWNER, SYSTEM)
    theirs = build_gap_id(OTHER_OWNER, SYSTEM, "email", "Stripe")
    assert not theirs.startswith(prefix)


def test_gap_id_helpers_refuse_an_empty_owner():
    """A missing owner raises rather than falling back to a bare
    `gap-{system}-` prefix -- which is the exact shape that collided
    across accounts before, and which the sweep would then match against
    nothing while the ids it wrote matched everything."""
    with pytest.raises(ValueError):
        gap_id_prefix("", SYSTEM)
    with pytest.raises(ValueError):
        build_gap_id(None, SYSTEM, "email", "Stripe")
