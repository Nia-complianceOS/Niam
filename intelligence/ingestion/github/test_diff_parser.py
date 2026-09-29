"""
Tests for the stage-1 keyword pre-filter.

Substring matching let short signals hit inside ordinary words -- "ssn" in
className, "age" in page/message/usage/storage, "dob" in adobe -- and on
one React frontend 1,255 of 1,564 candidates were className lines, each
one a paid classifier call.
"""

import pytest

from ingestion.github.diff_parser import (
    DEFAULT_SIGNALS,
    MAX_LINE_LENGTH,
    _matched_signals,
    _tokenize,
    find_candidate_lines_in_diff,
    find_candidate_lines_in_file,
)


@pytest.mark.parametrize(
    "line",
    [
        '<div className="flex items-center">',
        "const page = props.page + 1;",
        "setMessage(message);",
        "const usage = getUsage();",
        "localStorage.getItem('theme');",
        "import adobe from 'adobe-fonts';",
    ],
)
def test_noise_lines_are_not_candidates(line):
    assert _matched_signals(line, DEFAULT_SIGNALS) == []
    assert find_candidate_lines_in_file("a.tsx", line) == []


@pytest.mark.parametrize(
    "line, signal",
    [
        ("send(user.email)", "email"),
        ("const userEmail = form.value;", "email"),
        ("const dob = req.body.dob;", "dob"),
        ("user_age = 17", "age"),
        ("const userId = session.userId;", "user_id"),
        ("date_of_birth = models.DateField()", "date_of_birth"),
        ("mixpanel.track('signup')", "mixpanel"),
        ("mixpanel.track('signup')", "track("),
        ("stripe.customers.create({ email })", "stripe."),
        ("USER_ID = os.environ['X']", "user_id"),
        ("const emailAddress = x;", "address"),
    ],
)
def test_data_handling_lines_are_candidates(line, signal):
    assert signal in _matched_signals(line, DEFAULT_SIGNALS)
    assert len(find_candidate_lines_in_file("a.ts", line)) == 1


def test_tokenize_splits_camel_case_and_separators():
    assert _tokenize("userEmail") == ["user", "email"]
    assert _tokenize("HTTPServer") == ["http", "server"]
    assert _tokenize("date_of_birth") == ["date", "of", "birth"]


def test_long_lines_are_skipped_and_counted():
    long_line = "const email = 1;" + "x" * 600
    assert len(long_line) > MAX_LINE_LENGTH
    stats = {}
    content = "\n".join([long_line, "const email = 2;"])
    found = find_candidate_lines_in_file("bundle.js", content, stats=stats)
    assert [c.line_number for c in found] == [2]
    assert stats["long_lines_skipped"] == 1


def test_long_lines_are_skipped_in_diffs():
    diff = (
        "+++ b/app.js\n"
        "@@ -0,0 +1,2 @@\n"
        "+" + "email" + "y" * 600 + "\n"
        "+const email = 2;\n"
    )
    stats = {}
    found = find_candidate_lines_in_diff(diff, stats=stats)
    assert [c.line_number for c in found] == [2]
    assert stats["long_lines_skipped"] == 1
