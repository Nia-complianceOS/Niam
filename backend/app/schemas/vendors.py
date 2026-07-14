from typing import List

from pydantic import BaseModel


class Vendor(BaseModel):
    id: str
    name: str
    category: str
    data_collected: str
    coverage_status: str
    coverage_detail: str
    connection_active: bool = True


class VendorsResponse(BaseModel):
    vendors: List[Vendor]
