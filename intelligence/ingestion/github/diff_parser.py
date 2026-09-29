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
from functools import lru_cache
from typing import List, Optional

from .utils import get_logger

logger = get_logger(__name__)

# Lines longer than this are skipped: they are minified bundles or
# generated data, where one "line" holds thousands of tokens and matches
# every signal at once.
MAX_LINE_LENGTH = 500

# Signals suggesting a line plausibly touches personal data, a
# tracking/consent path, or a storage/vendor call. Broad on purpose —
# precision is the classifier's job, not this filter's.
DEFAULT_SIGNALS = [
    # PII-shaped fields
    "email",
    "phone",
    "address",
    "ssn",
    "dob",
    "date_of_birth",
    "full_name",
    "first_name",
    "last_name",
    "passport",
    "aadhaar",
    "pan_number",
    "credit_card",
    "card_number",
    "ip_address",
    # tracking / analytics
    "track(",
    "analytics",
    "mixpanel",
    "segment.",
    "amplitude",
    "user_id",
    "device_id",
    "session_id",
    # consent / minors
    "consent",
    "age",
    "minor",
    "parental",
    # storage / persistence
    "insert into",
    ".save(",
    ".create(",
    ".update(",
    "db.collection",
    "cursor.execute",
    "s3.put_object",
    # outbound vendor calls
    "stripe.",
    "firebase.",
    "requests.post",
    "fetch(",
    "axios.",
]

CODE_FILE_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".go",
    ".java",
    ".rb",
    ".php",
    ".cs",
    ".kt",
    ".swift",
}


@dataclass
class CandidateLine:
    """A single line flagged by the stage-1 pre-filter."""

    file_path: str
    line_number: Optional[int]  # None for removed diff lines
    content: str
    change_type: str  # "added" | "removed" | "full_scan"
    matched_signals: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "file_path": self.file_path,
            "line_number": self.line_number,
            "content": self.content.strip(),
            "change_type": self.change_type,
            "matched_signals": self.matched_signals,
        }


# Word pieces of an identifier: `HTTPServer` -> HTTP, Server; `userEmail`
# -> user, Email; digits stand alone. Applied after splitting on
# non-alphanumerics, so `date_of_birth` -> date, of, birth.
_TOKEN_RE = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+")
_PLAIN_RE = re.compile(r"[a-z0-9]+")
_SNAKE_RE = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)+")

# Plain signals this short match whole tokens only. As substrings they
# were noise: "ssn" in className, "age" in page/message/usage/storage,
# "dob" in adobe -- 1,255 of 1,564 candidates on one React frontend were
# className lines.
_SHORT_SIGNAL_MAX = 4


def _tokenize(line: str) -> List[str]:
    """Lowercase word pieces of a line, split on non-alphanumerics and on
    camelCase boundaries."""
    return [t.lower() for t in _TOKEN_RE.findall(line)]


def _token_equals(token: str, word: str) -> bool:
    # A trailing plural still counts: `user_ids`, `ages`.
    return token == word or token == word + "s"


@lru_cache(maxsize=32)
def _compile_signals(signals: tuple) -> tuple:
    """Sort each signal into how it is matched:
      short   -- plain word <= _SHORT_SIGNAL_MAX chars: whole token
      snake   -- has underscores: consecutive tokens, so `userId`,
                 `user_id` and `USER_ID` all match "user_id"
      word    -- longer plain word: substring of any token, so
                 `emailAddress` still matches "email" and "address"
      raw     -- punctuation or spaces ("track(", "insert into"):
                 case-insensitive substring of the raw line
    """
    compiled = []
    for signal in signals:
        low = signal.lower()
        if _PLAIN_RE.fullmatch(low):
            kind = "short" if len(low) <= _SHORT_SIGNAL_MAX else "word"
            compiled.append((signal, kind, low))
        elif _SNAKE_RE.fullmatch(low):
            compiled.append((signal, "snake", tuple(low.split("_"))))
        else:
            compiled.append((signal, "raw", low))
    return tuple(compiled)


def _has_sequence(tokens: List[str], parts: tuple) -> bool:
    n = len(parts)
    for i in range(len(tokens) - n + 1):
        if all(tokens[i + j] == parts[j] for j in range(n - 1)) and (
            _token_equals(tokens[i + n - 1], parts[-1])
        ):
            return True
    return False


def _matched_signals(line: str, signals: List[str]) -> List[str]:
    lowered = line.lower()
    tokens = None  # tokenised lazily; most signals are cheap to rule out
    hits = []
    for signal, kind, pattern in _compile_signals(tuple(signals)):
        if kind == "raw":
            if pattern in lowered:
                hits.append(signal)
            continue
        # Every token-based match implies the raw substring is present
        # (ignoring the separators a snake signal spans).
        probe = pattern[0] if kind == "snake" else pattern
        if probe not in lowered:
            continue
        if tokens is None:
            tokens = _tokenize(line)
        if kind == "short":
            matched = any(_token_equals(t, pattern) for t in tokens)
        elif kind == "snake":
            matched = _has_sequence(tokens, pattern)
        else:
            matched = any(pattern in t for t in tokens)
        if matched:
            hits.append(signal)
    return hits


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
            records.append(
                {
                    "file_path": current_file,
                    "line_number": new_line_no,
                    "content": raw_line[1:],
                    "change_type": "added",
                }
            )
            new_line_no = (new_line_no or 0) + 1
        elif raw_line.startswith("-") and not raw_line.startswith("---"):
            records.append(
                {
                    "file_path": current_file,
                    "line_number": None,  # removed line has no position in the new file
                    "content": raw_line[1:],
                    "change_type": "removed",
                }
            )
        # context lines don't appear at --unified=0

    return records


def _count_skipped(stats: Optional[dict], skipped: int) -> None:
    if stats is not None:
        stats["long_lines_skipped"] = (
            stats.get("long_lines_skipped", 0) + skipped
        )


def find_candidate_lines_in_diff(
    diff_text: str,
    signals: Optional[List[str]] = None,
    stats: Optional[dict] = None,
) -> List[CandidateLine]:
    """Stage-1 filter over a diff. Only *added* lines are kept — a
    reconciliation pass cares about new data-handling code, not
    code that was just deleted.

    `stats`, when given, has `long_lines_skipped` incremented."""
    signals = signals or DEFAULT_SIGNALS
    candidates = []
    skipped_long = 0
    for rec in parse_unified_diff(diff_text):
        if rec["change_type"] != "added":
            continue
        if len(rec["content"]) > MAX_LINE_LENGTH:
            skipped_long += 1
            continue
        hits = _matched_signals(rec["content"], signals)
        if hits:
            candidates.append(
                CandidateLine(
                    file_path=rec["file_path"],
                    line_number=rec["line_number"],
                    content=rec["content"],
                    change_type="added",
                    matched_signals=hits,
                )
            )
    if skipped_long:
        logger.info(
            "Skipped %d diff line(s) longer than %d chars",
            skipped_long,
            MAX_LINE_LENGTH,
        )
    _count_skipped(stats, skipped_long)
    return candidates


def find_candidate_lines_in_file(
    file_path: str,
    content: str,
    signals: Optional[List[str]] = None,
    stats: Optional[dict] = None,
) -> List[CandidateLine]:
    """Stage-1 filter over a full file — used for the first-pass repo
    scan, before any commit history exists to diff against.

    `stats`, when given, has `long_lines_skipped` incremented; the repo
    scanner aggregates and logs it, since a per-file log would flood."""
    signals = signals or DEFAULT_SIGNALS
    candidates = []
    skipped_long = 0
    for i, line in enumerate(content.splitlines(), start=1):
        if len(line) > MAX_LINE_LENGTH:
            skipped_long += 1
            continue
        hits = _matched_signals(line, signals)
        if hits:
            candidates.append(
                CandidateLine(
                    file_path=file_path,
                    line_number=i,
                    content=line,
                    change_type="full_scan",
                    matched_signals=hits,
                )
            )
    if skipped_long:
        logger.debug(
            "Skipped %d line(s) longer than %d chars in %s",
            skipped_long,
            MAX_LINE_LENGTH,
            file_path,
        )
    _count_skipped(stats, skipped_long)
    return candidates
