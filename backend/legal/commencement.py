"""
legal/commencement.py — the DPDP Act 2023's staggered commencement
schedule, as structured data (section number -> effective date), not as
quoted Act text.

The Act itself doesn't fix commencement dates (s.1(2) leaves it to a
future Gazette notification: "different dates may be appointed for
different provisions of this Act"). The dates below come from the
notification actually issued (G.S.R. 843(E), 13th November 2025),
referenced as a footnote in the Act's own published text.

Why this matters for the graph: a compliance tool that treats a
not-yet-commenced clause as a live legal obligation is wrong in a way
that matters. schema.py's original design already anticipated this
(DPDPClause nodes carry `effective_from` and `status`) — this module is
what actually computes those two values per section.

IMPORTANT: this is a point-in-time snapshot of one notification. If the
Central Government issues further notifications (bringing Tranche 2 or
3 into force, or amending the schedule), this file needs a manual
update — there's no live Gazette feed wired into this pipeline.
"""

from datetime import date

# Tranche 1 — commenced 13 Nov 2025. Mostly definitional/administrative/
# Board-setup sections — none of these impose a data-handling obligation
# tied to a specific data type, but they're included for completeness.
TRANCHE_1_DATE = date(2025, 11, 13)
TRANCHE_1_SECTIONS = {
    "1",
    "2",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "35",
    "36",
    "37",
    "38",
    "39",
    "40",
    "41",
    "42",
    "43",
}

# Tranche 2 — commences 13 Nov 2026 (one year after Tranche 1). Only two
# narrow sub-provisions: Consent Manager registration (s.6(9)) and the
# Board's power over Consent Manager registration breaches (s.27(1)(d)).
TRANCHE_2_DATE = date(2026, 11, 13)
TRANCHE_2_SUBSECTIONS = {("6", "9"), ("27", "1(d)")}

# Tranche 3 — commences 13 May 2027 (eighteen months after Tranche 1).
# This is where nearly every data-handling obligation actually lives:
# grounds for processing, notice, the bulk of consent, children's data,
# Significant Data Fiduciary duties, Data Principal rights, cross-border
# transfer, exemptions, and the penalties/adjudication machinery.
TRANCHE_3_DATE = date(2027, 5, 13)
TRANCHE_3_SECTIONS = {
    "3",
    "4",
    "5",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "28",
    "29",
    "30",
    "31",
    "32",
    "33",
    "34",
}

# Sections 6, 27, and 44 are split across tranches at the sub-section
# level and are handled specially in status_for_section() below, rather
# than being placed in a single tranche set.


# --- which sections actually oblige a Data Fiduciary -------------------
#
# Commencement is not the only question this module has to answer. The
# reconciler needs to know whether a clause imposes a DATA-HANDLING DUTY
# at all, because "is this data type governed?" was being answered by
# counting any in-force clause -- and the only sections in force today
# are ss.36 and 37, the Central Government's powers to call for
# information and to issue directions. Those bind the regulator, not the
# fiduciary. Counting them as coverage marked every data type in the
# graph as governed and silenced the gap engine completely.
#
# Defined POSITIVELY, as the substantive duties in Chapters II and III:
# grounds for processing (3-5), consent and consent managers (6),
# legitimate uses (7), general obligations of a Data Fiduciary (8),
# children's data (9), Significant Data Fiduciaries (10), the rights of
# a Data Principal that a fiduciary must honour (11-14), duties of a
# Data Principal (15), cross-border transfer (16) and the exemptions
# that qualify all of the above (17).
#
# A positive set on purpose: a section number nobody has classified
# falls OUTSIDE it and therefore does not close a gap. For a compliance
# tool, an unrecognised clause should leave a finding standing for a
# human to dismiss, never quietly clear one.
FIDUCIARY_OBLIGATION_SECTIONS = {str(n) for n in range(3, 18)}


def imposes_data_obligation(section: str) -> bool:
    """True if this section places a data-handling duty on a fiduciary.

    Everything else in the Act -- definitions (1-2), the Data Protection
    Board's constitution and procedure (18-28), appeals and penalties
    (29-34), and the Government's own powers (35-44) -- matters, but not
    as an answer to "is this data type covered?".
    """
    return str(section).strip() in FIDUCIARY_OBLIGATION_SECTIONS


def status_for_section(section: str, as_of: date = None) -> dict:
    """
    Returns {"effective_from": "YYYY-MM-DD" | None, "status": str} for a
    top-level section number, as of a given date (defaults to today).

    For sections 6, 27, and 44 — split across tranches at the
    sub-section level — this reports the date for the section's main
    body of obligations, with a `note` flagging the narrower carve-out
    that commences separately. That's a safe default: it won't
    misreport a section as fully dormant when its substantive
    obligations are in fact already in force (or vice versa).
    """
    if as_of is None:
        as_of = date.today()

    def _status(effective: date) -> str:
        return "in_force" if as_of >= effective else "not_yet_commenced"

    if section in TRANCHE_1_SECTIONS:
        return {
            "effective_from": TRANCHE_1_DATE.isoformat(),
            "status": _status(TRANCHE_1_DATE),
        }

    if section == "6":
        return {
            "effective_from": TRANCHE_3_DATE.isoformat(),
            "status": _status(TRANCHE_3_DATE),
            "note": f"sub-section (9) only (Consent Manager registration) "
            f"commences separately on {TRANCHE_2_DATE.isoformat()}",
        }

    if section == "27":
        return {
            "effective_from": TRANCHE_3_DATE.isoformat(),
            "status": _status(TRANCHE_3_DATE),
            "note": f"clause (1)(d) only commences separately on {TRANCHE_2_DATE.isoformat()}",
        }

    if section == "44":
        return {
            "effective_from": TRANCHE_1_DATE.isoformat(),
            "status": _status(TRANCHE_1_DATE),
            "note": f"sub-section (2) only commences separately on {TRANCHE_3_DATE.isoformat()}",
        }

    if section in TRANCHE_3_SECTIONS:
        return {
            "effective_from": TRANCHE_3_DATE.isoformat(),
            "status": _status(TRANCHE_3_DATE),
        }

    # Unknown section number (e.g. Schedule/preamble noise that slipped
    # past dpdp_source.py's filter) — fail closed rather than guess.
    return {"effective_from": None, "status": "unknown"}
