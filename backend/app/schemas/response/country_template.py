"""Country template preview (what a new business gets, D-28)."""

from pydantic import BaseModel


class TemplateGroupOut(BaseModel):
    name: str
    root_key: str


class TemplateAccountOut(BaseModel):
    code: str
    name: str
    root_key: str
    group_name: str | None


class CountryTemplatePreviewResponse(BaseModel):
    template_key: str
    template_name: str
    country_id: str | None
    base_currency_code: str
    date_format: str
    number_format: str
    groups: list[TemplateGroupOut]
    accounts: list[TemplateAccountOut]
