"""Country template preview for the create-business form (understanding.md §6.2, D-28)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.country_template_repository import CountryTemplateRepository
from app.schemas.response.country_template import (
    CountryTemplatePreviewResponse,
    TemplateAccountOut,
    TemplateGroupOut,
)


class CountryTemplateService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = CountryTemplateRepository(session)

    async def preview(self, country_id: str | None) -> CountryTemplatePreviewResponse:
        """The country's template, or the generic chart when it has none."""
        template = await self.repo.for_country(country_id)
        return CountryTemplatePreviewResponse(
            template_key=template.key, template_name=template.name, country_id=template.country_id,
            base_currency_code=template.base_currency_code, date_format=template.date_format,
            number_format=template.number_format,
            groups=[TemplateGroupOut.model_validate(g._mapping) for g in await self.repo.groups(template.id)],
            accounts=[TemplateAccountOut.model_validate(a._mapping) for a in await self.repo.accounts(template.id)],
        )
