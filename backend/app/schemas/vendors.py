from typing import List

from pydantic import BaseModel


class Vendor(BaseModel):
    id: str
    name: str
    # None when nothing has told us what kind of vendor this is. The graph
    # never writes v.category today, and defaulting it to "Third Party"
    # printed a category we had not established for every single vendor.
    category: str | None = None
    data_collected: str
    coverage_status: str
    coverage_detail: str

    # REQUIRED, and deliberately has no default. It used to default to
    # True and was never set by list_vendors(), so every vendor rendered a
    # green "Connected" badge -- including names the LLM merely spotted in
    # source code, which we have no integration with whatsoever.
    connection_active: bool
    # How we know this vendor exists at all: "vendor_api" means an
    # ingestion run actually talked to it; "code_scan" means its name
    # appeared in scanned source.
    discovered_via: str = "code_scan"


class VendorsResponse(BaseModel):
    vendors: List[Vendor]
