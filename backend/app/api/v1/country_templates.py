"""Country template preview (create-business form, D-28)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.schemas.auth import CurrentUser
from app.schemas.common import IdStr
from app.schemas.response.country_template import CountryTemplatePreviewResponse
from app.services.country_template_service import CountryTemplateService

router = APIRouter(prefix="/country-templates", tags=["Countries"])


@router.get("/preview", response_model=CountryTemplatePreviewResponse)
async def preview_country_template(
    country_id: IdStr | None = Query(None),
    _user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CountryTemplatePreviewResponse:
    """What a new business in this country gets (the generic chart when it has no template)."""
    return await CountryTemplateService(db).preview(country_id)
