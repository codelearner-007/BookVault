"""Request schemas for tab column visibility/ordering (display only)."""

from pydantic import Field

from app.schemas.common import KEY_MAX, LIST_MAX, RequestModel


class TabColumnItem(RequestModel):
    col_key: str = Field(min_length=1, max_length=KEY_MAX, pattern=r"^[A-Za-z0-9_.-]+$")
    visible: bool
    order_index: int = Field(ge=0, le=LIST_MAX)


class TabColumnsUpdate(RequestModel):
    columns: list[TabColumnItem] = Field(max_length=LIST_MAX)
