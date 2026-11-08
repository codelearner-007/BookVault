"""Country template read repository (templates are seed data; applied by apply_country_template())."""

from sqlalchemy import text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

# The country's template, else the generic one (country_id IS NULL).
_TEMPLATE = text("""
    SELECT CAST(t.id AS text) AS id, t.key, t.name, CAST(t.country_id AS text) AS country_id,
           c.code AS base_currency_code, t.date_format, t.number_format
    FROM public.country_templates t JOIN public.currencies c ON c.id = t.base_currency_id
    WHERE t.country_id = CAST(:country_id AS uuid) OR t.country_id IS NULL
    ORDER BY t.country_id NULLS LAST LIMIT 1
""")
_GROUPS = text("""
    SELECT g.name, g.root_key FROM public.country_template_groups g
    JOIN public.coa_root_groups r ON r.key = g.root_key
    WHERE g.template_id = CAST(:template_id AS uuid) ORDER BY r.sort_order, g.sort_order
""")
_ACCOUNTS = text("""
    SELECT a.code, a.name, COALESCE(a.root_key, g.root_key) AS root_key, g.name AS group_name
    FROM public.country_template_accounts a
    LEFT JOIN public.country_template_groups g ON g.template_id = a.template_id AND g.id = a.group_id
    JOIN public.coa_root_groups r ON r.key = COALESCE(a.root_key, g.root_key)
    WHERE a.template_id = CAST(:template_id AS uuid) ORDER BY r.sort_order, a.code
""")


class CountryTemplateRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def for_country(self, country_id: str | None) -> Row:
        return (await self.session.execute(_TEMPLATE, {"country_id": country_id})).one()

    async def groups(self, template_id: str) -> list[Row]:
        return list((await self.session.execute(_GROUPS, {"template_id": template_id})).all())

    async def accounts(self, template_id: str) -> list[Row]:
        return list((await self.session.execute(_ACCOUNTS, {"template_id": template_id})).all())
