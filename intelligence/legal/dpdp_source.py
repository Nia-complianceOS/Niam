"""
legal/dpdp_source.py — fetches the Digital Personal Data Protection Act,
2023 from India Code (the official Government of India repository for
central legislation) and splits it into per-section chunks for
downstream Gemini-based clause extraction.

Why India Code specifically: it hosts every central Act the same way,
not just DPDP — this exact fetch-and-split pattern will work unchanged
when a second regulation (GDPR-equivalent, RBI, etc.) gets added later.
It has no structured API/JSON endpoint; every Act is served as a PDF.

Source page: https://www.indiacode.nic.in/handle/123456789/22037
PDF:         https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf
"""

import re
import logging
from io import BytesIO
from typing import List, Dict

import requests
from pypdf import PdfReader

logger = logging.getLogger(__name__)

# Source URLs, tried in order until one both downloads AND parses.
#
# India Code is primary: it publishes the "bare Act" layout this module's
# _SECTION_RE was written for — "9. Processing of personal data of
# children.—(1) The Data Fiduciary shall..." — and yields a clean 44/44
# section match. It does 404 intermittently, which is why there is a
# fallback at all.
#
# MeitY hosts the Gazette printing of the same Act. Same law, same
# wording, but the Gazette puts section titles in the MARGIN rather than
# inline, so extracted text reads "9. (1) The Data Fiduciary shall..."
# with no title and no em-dash. _SECTION_RE matches 0 of 44 against it.
# It is kept in the list deliberately: if India Code is down, failing
# loudly on a source we know we cannot parse is better than silently
# having no fallback at all — and if MeitY ever publishes the bare-Act
# layout, it starts working with no code change.
#
# Override with fetch_act_text(url=...) or the loader's --url flag.
DPDP_ACT_PDF_URLS = [
    "https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf",
    "https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf",
]

# A source that downloads but yields fewer than this many parseable
# sections is treated as a failed source, not as a parse bug. The Act has
# 44; anything under 30 means the layout is wrong, not that the PDF is.
_MIN_EXPECTED_SECTIONS = 30

# Back-compat: anything importing the old single-URL name still works.
DPDP_ACT_PDF_URL = DPDP_ACT_PDF_URLS[0]

# The Act's PDF opens with a table of contents ("ARRANGEMENT OF SECTIONS")
# that repeats every section title — if this isn't skipped, the section
# splitter below double-counts every section (once from the TOC, once
# from the real body). Every Indian Act's operative text begins with
# this exact enacting formula, right after the TOC — a reliable anchor
# to cut the TOC away regardless of formatting quirks elsewhere.
_ENACTING_FORMULA = "BE it enacted by Parliament"

# Matches e.g. "9. Processing of personal data of children.—(1) The Data
# Fiduciary shall..." — a leading section number, a title ending in a
# period, then one or more em/en dash or hyphen characters, optionally
# followed by whitespace, before the body starts.
#
# Two real formatting quirks in the actual PDF text drove the shape of
# this regex — both silently dropped a whole section before this fix:
#   1. `[^.]` (not `[^.\n]`) lets the title span an embedded line-wrap —
#      e.g. section 21's title wraps mid-sentence: "...Chairperson and
#      Members of \nBoard.—(1)...". Excluding only "\n" would refuse to
#      match past the wrap and the whole section silently vanishes.
#   2. Trailing `\s*` (not a `(?=\S)` lookahead) allows a space between
#      the dash and the body — e.g. section 29 uses ".— (1)..." and
#      section 41 uses ".— Every rule made..." (single dash + space,
#      not immediately followed by non-whitespace).
_SECTION_RE = re.compile(
    r"(?m)^\s*(\d{1,2})\.\s+([^.]+?)\.\s*[\u2013\u2014\-]+\s*"
)

# Sections above this number belong to THE SCHEDULE (penalty amounts) or
# the Statement of Objects and Reasons, which follow section 44 in the
# same PDF and aren't numbered Act sections — a stray digit in there
# (e.g. "250 crore rupees") can false-match the section regex.
_LAST_REAL_SECTION = 44


def _fetch_one(url: str, timeout: int) -> str:
    """Download a single candidate URL and extract its text, validating
    that what came back really is the Act."""
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    reader = PdfReader(BytesIO(resp.content))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages)
    if _ENACTING_FORMULA not in text:
        raise ValueError(
            f"Fetched PDF doesn't contain the expected enacting formula "
            f"({_ENACTING_FORMULA!r}) — the source may have changed format, "
            f"moved, or the download may be incomplete. Got {len(text)} chars."
        )

    # Downloading is not the same as being usable. The Gazette printing of
    # the Act contains the enacting formula but puts section titles in the
    # margin, so it parses to zero sections. Check that here, at the source
    # boundary, so an unparseable source is rejected and the next candidate
    # is tried — instead of surfacing later as a confusing "no sections
    # matched" error that looks like a regex bug.
    found = len(_SECTION_RE.findall(text[text.index(_ENACTING_FORMULA):]))
    if found < _MIN_EXPECTED_SECTIONS:
        raise ValueError(
            f"PDF downloaded and looks like the Act, but only {found} "
            f"sections parsed (expected >= {_MIN_EXPECTED_SECTIONS}). This "
            f"source most likely uses the Gazette layout, which puts section "
            f"titles in the margin instead of inline before an em-dash."
        )

    logger.info(
        "Fetched DPDP Act text from %s: %d characters, %d pages, %d sections",
        url,
        len(text),
        len(pages),
        found,
    )
    return text


def fetch_act_text(url: str | None = None, timeout: int = 30) -> str:
    """Downloads the Act PDF and extracts raw text. Raises rather than
    returning something misleadingly partial — a legal-text source
    failing silently is worse than a loud error here.

    With no explicit url, tries DPDP_ACT_PDF_URLS in order and returns the
    first that both downloads and validates. If every candidate fails, the
    error names each one and why, so a dead link is obvious rather than
    looking like a parser bug.
    """
    if url is not None:
        return _fetch_one(url, timeout)

    failures = []
    for candidate in DPDP_ACT_PDF_URLS:
        try:
            return _fetch_one(candidate, timeout)
        except Exception as exc:
            logger.warning("Source failed (%s): %s", candidate, exc)
            failures.append(f"  {candidate}\n    -> {exc}")

    raise RuntimeError(
        "Could not fetch the DPDP Act from any known source:\n"
        + "\n".join(failures)
        + "\n\nIf every source is dead, find a current PDF of the Act and pass it "
          "with --url, or add it to DPDP_ACT_PDF_URLS."
    )


def split_into_sections(act_text: str) -> List[Dict]:
    """Splits the Act's operative text (after the TOC) into one chunk per
    numbered section. Returns [{"section": "9", "title": ..., "body": ...}, ...],
    sections 1-44 only (see _LAST_REAL_SECTION above)."""
    idx = act_text.index(_ENACTING_FORMULA)
    body_text = act_text[idx:]

    matches = list(_SECTION_RE.finditer(body_text))
    if not matches:
        raise ValueError(
            "No sections matched _SECTION_RE against the fetched text — "
            "the PDF's text layout may have changed; check the regex "
            "against a fresh extract before assuming the source moved."
        )

    sections = []
    for i, m in enumerate(matches):
        section_num = m.group(1)
        try:
            if int(section_num) > _LAST_REAL_SECTION:
                continue
        except ValueError:
            continue

        title = re.sub(r"\s+", " ", m.group(2)).strip()
        start = m.end()
        end = (
            matches[i + 1].start() if i + 1 < len(matches) else len(body_text)
        )
        section_body = body_text[start:end].strip()

        sections.append(
            {"section": section_num, "title": title, "body": section_body}
        )

    logger.info(
        "Split Act text into %d sections (1-%d)",
        len(sections),
        _LAST_REAL_SECTION,
    )
    return sections
