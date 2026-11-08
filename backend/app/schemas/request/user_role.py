"""User role request schemas."""

from app.schemas.common import IdStr, RequestModel


class AssignUserRoleRequest(RequestModel):
    role_id: IdStr
