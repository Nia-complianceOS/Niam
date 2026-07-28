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

DPDP_ACT_PDF_URL = "https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf"

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
    r'(?m)^\s*(\d{1,2})\.\s+([^.]+?)\.\s*[\u2013\u2014\-]+\s*'
)

# Sections above this number belong to THE SCHEDULE (penalty amounts) or
# the Statement of Objects and Reasons, which follow section 44 in the
# same PDF and aren't numbered Act sections — a stray digit in there
# (e.g. "250 crore rupees") can false-match the section regex.
_LAST_REAL_SECTION = 44


def fetch_act_text(url: str = DPDP_ACT_PDF_URL, timeout: int = 30) -> str:
    """Downloads the Act PDF and extracts raw text. Raises rather than
    returning something misleadingly partial — a legal-text source
    failing silently is worse than a loud error here."""
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
    logger.info("Fetched DPDP Act text: %d characters across %d PDF pages", len(text), len(pages))
    return text


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

        title = re.sub(r'\s+', ' ', m.group(2)).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body_text)
        section_body = body_text[start:end].strip()

        sections.append({"section": section_num, "title": title, "body": section_body})

    logger.info("Split Act text into %d sections (1-%d)", len(sections), _LAST_REAL_SECTION)
    return sections
