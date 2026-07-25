"""
Standalone smoke test for classifier.py — isolates the Gemini call
from everything else so a failure here means "API setup problem",
not "scanner logic problem".

Run from the nia/ project root:
    python -m app.ingestion.github.smoke_test

Requires: pip install google-genai python-dotenv
Requires: GEMINI_API_KEY set in .env (use a freshly rotated key)
"""

from .classifier import DataHandlingClassifier
from .diff_parser import CandidateLine

# Two obvious cases: one should classify as data-handling, one should not.
test_candidates = [
    CandidateLine(
        file_path="signup.py",
        line_number=42,
        content='    stripe.Customer.create(email=user.email)',
        change_type="added",
        matched_signals=["stripe.", "email"],
    ),
    CandidateLine(
        file_path="styles.py",
        line_number=7,
        content='    css_class = "user-id-badge"',
        change_type="added",
        matched_signals=["user_id"],
    ),
]


def main():
    print("Initializing classifier (will fail here if GEMINI_API_KEY is missing/invalid)...")
    classifier = DataHandlingClassifier()

    print("Sending 2 test candidates to Gemini 2.5 Flash...")
    results = classifier.classify_candidates(test_candidates)

    print("\n--- Results ---")
    for r in results:
        print(f"{r['file_path']}:{r['line_number']}  {r['content']!r}")
        print(f"  is_data_handling = {r['is_data_handling']}")
        print(f"  data_type        = {r['data_type']}")
        print(f"  vendor           = {r['vendor']}")
        print(f"  confidence       = {r['confidence']}")
        print(f"  reasoning        = {r['reasoning']}")
        print()

    # Sanity check the two obvious cases came out right
    stripe_result, css_result = results
    if stripe_result["is_data_handling"] is True and css_result["is_data_handling"] is False:
        print("PASS: classifier distinguished real data-handling code from a false positive.")
    else:
        print("CHECK MANUALLY: results don't match the expected obvious-case pattern above.")


if __name__ == "__main__":
    main()
