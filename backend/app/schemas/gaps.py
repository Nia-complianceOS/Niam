from typing import List

from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.common import CommitRef


class RemediationDraft(BaseModel):
    document: str
    summary: str
    file_path: str | None = None
    diff_text: str | None = None


class Gap(BaseModel):
    id: str
    title: str
    status: str
    # The reconciler has always written both of these onto :Gap nodes and
    # the API has always dropped them, so the UI could not distinguish a
    # high-severity ungoverned egress from a low-severity collection, or a
    # present violation from an obligation that commences in 2027.
    # "high" | "medium" | "low".
    severity: str | None = None
    # "ungoverned_egress" | "future_obligation" | "ungoverned_collection".
    kind: str | None = None
    # How this data type is covered: "specific" when a clause names it,
    # "general" when only the Act's all-personal-data obligations reach
    # it, "none" when nothing does. Most DPDP obligations are general, so
    # stating a general finding as though the Act singled this data out
    # would overstate it.
    coverage_basis: str | None = None
    source_commit: CommitRef | None = None
    # File the provenance points at, when the reconciler found one. Not the
    # same as affected_documents (policy documents), which has no real
    # source yet and therefore stays empty.
    source_file: str | None = None
    vendor: str | None = None
    data_types: List[str] = []
    affected_documents: List[str] = []
    regulations: List[str] = []
    ai_recommendation: str = ""
    remediation_drafts: List[RemediationDraft] = []
    # All three come from the :PullRequest node, never from the :Gap's own
    # pr_id property. The property survived restarts while the pull request
    # itself lived in a process dictionary, so it outlived its subject.
    pr_id: str | None = None
    pr_url: str | None = None
    pr_number: int | None = None
    detected_at: str | None = None
    updated_at: str | None = None

    @field_validator("detected_at", "updated_at", mode="before")
    @classmethod
    def parse_timestamps(cls, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return value


class GapsResponse(BaseModel):
    # None when there is nothing to score (empty graph) or the graph could
    # not be read. Never substitute a number for "unknown".
    score: float | None = None
    score_explanation: str | None = None
    # None until there is a previous measurement to compare against. This
    # used to be a required float and list_gaps() satisfied it with a
    # hardcoded -4.0 -- a movement the app had never observed, rendered
    # next to real numbers.
    score_delta: float | None = None
    open_gap_count: int
    gaps: List[Gap]


class GenerateFixResponse(BaseModel):
    gap_id: str
    remediation_drafts: List[RemediationDraft]
