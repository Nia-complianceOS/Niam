"""
Stage 1 of the two-stage code scanner: a cheap, syntax-agnostic
keyword pre-filter over diffs or raw files.

This is deliberately high-recall / low-precision — it over-triggers
on purpose. Stage 2 (classifier.py) is the LLM pass that makes the
real call on whether a candidate line is genuine data-handling code.
See onboarding doc, Section 07: "A cheap keyword pre-filter narrows
candidates, then an LLM classifier makes the final call."
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional

# Signals suggesting a line plausibly touches personal data, a
# tracking/consent path, or a storage/vendor call. Broad on purpose —
# precision is the classifier's job, not this filter's.
DEFAULT_SIGNALS = [
    # PII-shaped fields
    "email", "phone", "address", "ssn", "dob", "date_of_birth",
    "full_name", "first_name", "last_name", "passport", "aadhaar",
    "pan_number", "credit_card", "card_number", "ip_address",
    # tracking / analytics
    "track(", "analytics", "mixpanel", "segment.", "amplitude",
    "user_id", "device_id", "session_id",
    # consent / minors
    "consent", "age", "minor", "parental",
    # storage / persistence
    "insert into", ".save(", ".create(", ".update(", "db.collection",
    "cursor.execute", "s3.put_object",
    # outbound vendor calls
    "stripe.", "firebase.", "requests.post", "fetch(", "axios.",
]

CODE_FILE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".java", ".rb",
    ".php", ".cs", ".kt", ".swift",
}


@dataclass
class CandidateLine:
    """A single line flagged by the stage-1 pre-filter."""
    file_path: str
    line_number: Optional[int]   # None for removed diff lines
    content: str
    change_type: str             # "added" | "removed" | "full_scan"
    matched_signals: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "file_path": self.file_path,
            "line_number": self.line_number,
            "content": self.content.strip(),
            "change_type": self.change_type,
            "matched_signals": self.matched_signals,
        }


def _matched_signals(line: str, signals: List[str]) -> List[str]:
    lowered = line.lower()
    return [s for s in signals if s.lower() in lowered]


def parse_unified_diff(diff_text: str) -> List[dict]:
    """
    Parses `git diff --unified=0` output into per-line records with
    file path and line number, so candidates can be reported as
    "file X, line N" — the Week 1-2 definition of done.
    """
    records = []
    current_file = None
    new_line_no = None

    file_header_re = re.compile(r"^\+\+\+ b/(.+)$")
    hunk_header_re = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")

    for raw_line in diff_text.splitlines():
        file_match = file_header_re.match(raw_line)
        if file_match:
            current_file = file_match.group(1)
            continue

        hunk_match = hunk_header_re.match(raw_line)
        if hunk_match:
            new_line_no = int(hunk_match.group(1))
            continue

        if current_file is None:
            continue  # still in the diff preamble (index/--- lines)

        if raw_line.startswith("+") and not raw_line.startswith("+++"):
            records.append({
                "file_path": current_file,
                "line_number": new_line_no,
                "content": raw_line[1:],
                "change_type": "added",
            })
            new_line_no = (new_line_no or 0) + 1
        elif raw_line.startswith("-") and not raw_line.startswith("---"):
            records.append({
                "file_path": current_file,
                "line_number": None,  # removed line has no position in the new file
                "content": raw_line[1:],
                "change_type": "removed",
            })
        # context lines don't appear at --unified=0

    return records


def find_candidate_lines_in_diff(
    diff_text: str,
    signals: Optional[List[str]] = None,
) -> List[CandidateLine]:
    """Stage-1 filter over a diff. Only *added* lines are kept — a
    reconciliation pass cares about new data-handling code, not
    code that was just deleted."""
    signals = signals or DEFAULT_SIGNALS
    candidates = []
    for rec in parse_unified_diff(diff_text):
        if rec["change_type"] != "added":
            continue
        hits = _matched_signals(rec["content"], signals)
        if hits:
            candidates.append(CandidateLine(
                file_path=rec["file_path"],
                line_number=rec["line_number"],
                content=rec["content"],
                change_type="added",
                matched_signals=hits,
            ))
    return candidates


def find_candidate_lines_in_file(
    file_path: str,
    content: str,
    signals: Optional[List[str]] = None,
) -> List[CandidateLine]:
    """Stage-1 filter over a full file — used for the first-pass repo
    scan, before any commit history exists to diff against."""
    signals = signals or DEFAULT_SIGNALS
    candidates = []
    for i, line in enumerate(content.splitlines(), start=1):
        hits = _matched_signals(line, signals)
        if hits:
            candidates.append(CandidateLine(
                file_path=file_path,
                line_number=i,
                content=line,
                change_type="full_scan",
                matched_signals=hits,
            ))
    return candidates
