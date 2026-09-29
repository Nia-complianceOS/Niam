"""
Tests for GitHubScanner's stage-2 filtering and the per-scan candidate
cap. Local scans over a tmp dir with a fake classifier: no network, no
Gemini key.
"""

from ingestion.github import scanner as scanner_mod
from ingestion.github.scanner import (
    MAX_CANDIDATES_PER_SCAN,
    GitHubScanner,
    max_candidates_per_scan,
)


class _FakeClassifier:
    """Confirms lines containing 'email'; fails (None) on 'phone';
    rejects the rest -- the three outcomes the real classifier has."""

    def __init__(self):
        self.seen = []

    def classify_candidates(self, candidates):
        out = []
        for c in candidates:
            d = c.to_dict() if hasattr(c, "to_dict") else dict(c)
            self.seen.append(d)
            if "email" in d["content"]:
                verdict = True
            elif "phone" in d["content"]:
                verdict = None
            else:
                verdict = False
            d["is_data_handling"] = verdict
            out.append(d)
        return out


def _scanner(tmp_path, **kwargs):
    return GitHubScanner(
        repo_path=str(tmp_path), classifier=_FakeClassifier(), **kwargs
    )


def test_classify_and_log_returns_only_confirmed_lines(tmp_path):
    """The UI path writes this list straight to the graph, so rejected and
    unclassifiable lines must not be in it."""
    (tmp_path / "a.py").write_text(
        "user.email = x\nuser.phone = y\nconsent = True\n"
    )
    results = _scanner(tmp_path).scan_repo(classify=True)
    assert [r["content"] for r in results] == ["user.email = x"]
    assert all(r["is_data_handling"] is True for r in results)


def test_classify_false_still_returns_every_candidate(tmp_path):
    """The CLIs take this path and filter after classifying themselves."""
    (tmp_path / "a.py").write_text("user.email = x\nuser.phone = y\n")
    results = _scanner(tmp_path).scan_repo(classify=False)
    assert len(results) == 2


def _write_candidates(tmp_path, per_file, files):
    for f in range(files):
        lines = [f"email_{f}_{i} = user.email" for i in range(per_file)]
        (tmp_path / f"f{f:02d}.py").write_text("\n".join(lines) + "\n")


def test_cap_truncates_in_file_order_and_reports_it(tmp_path):
    _write_candidates(tmp_path, per_file=3, files=4)  # 12 candidates
    s = _scanner(tmp_path, max_candidates=5)
    results = s.scan_repo(classify=True)

    assert len(s.classifier.seen) == 5
    assert [r["file_path"] for r in results] == ["f00.py"] * 3 + ["f01.py"] * 2
    stats = s.last_scan_stats
    assert stats["truncated"] is True
    assert stats["candidates_found"] == 12
    assert stats["candidates_dropped"] == 7
    assert stats["max_candidates"] == 5
    assert stats["candidates_confirmed"] == 5


def test_no_truncation_under_the_cap(tmp_path):
    _write_candidates(tmp_path, per_file=2, files=2)
    s = _scanner(tmp_path)
    assert len(s.scan_repo(classify=False)) == 4
    assert s.last_scan_stats["truncated"] is False
    assert s.last_scan_stats["candidates_dropped"] == 0
    assert s.last_scan_stats["candidates_confirmed"] is None


def test_env_var_overrides_the_cap(tmp_path, monkeypatch):
    monkeypatch.setenv("SCAN_MAX_CANDIDATES", "3")
    assert max_candidates_per_scan() == 3
    _write_candidates(tmp_path, per_file=2, files=3)
    s = _scanner(tmp_path)
    assert len(s.scan_repo(classify=False)) == 3
    assert s.last_scan_stats["candidates_dropped"] == 3


def test_bad_env_value_keeps_the_default(monkeypatch):
    assert MAX_CANDIDATES_PER_SCAN == 400
    for bad in ("0", "-5", "lots"):
        monkeypatch.setenv("SCAN_MAX_CANDIDATES", bad)
        assert max_candidates_per_scan() == MAX_CANDIDATES_PER_SCAN
    monkeypatch.delenv("SCAN_MAX_CANDIDATES")
    assert scanner_mod.max_candidates_per_scan() == MAX_CANDIDATES_PER_SCAN
