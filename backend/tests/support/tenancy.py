"""Cross-tenant test helper: every route under /businesses/{business_id}."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from fastapi.routing import APIRoute

from app.main import app

BUSINESS_PATH_PARAM = "{business_id}"
_PATH_PARAM = re.compile(r"\{([^}]+)\}")
# A placeholder for every other path id: unknown ids must not change the 404 answer.
_OTHER_ID = str(uuid.UUID(int=1))


@dataclass(frozen=True)
class BusinessRoute:
    method: str
    path: str
    route: APIRoute

    @property
    def id(self) -> str:
        return f"{self.method} {self.path}"

    def url_for(self, business_id: str) -> str:
        def fill(match: re.Match[str]) -> str:
            return business_id if match.group(1) == "business_id" else _OTHER_ID

        return _PATH_PARAM.sub(fill, self.path)


def business_routes() -> list[BusinessRoute]:
    """All (method, path) pairs whose path contains {business_id}, in registration order."""
    found = []
    for route in app.routes:
        if isinstance(route, APIRoute) and BUSINESS_PATH_PARAM in route.path:
            for method in sorted(route.methods):
                found.append(BusinessRoute(method, route.path, route))
    return found


def has_business_access_dependency(route: APIRoute) -> bool:
    """True when the route (or its router) depends on a business-access guard."""
    stack = list(route.dependant.dependencies)
    while stack:
        dependant = stack.pop()
        if getattr(dependant.call, "grants_business_access", False):
            return True
        stack.extend(dependant.dependencies)
    return False


async def request_as(client, user, business_route: BusinessRoute, business_id: str):
    """Call a business route as `user`; bodies are empty JSON (the guard runs first)."""
    method = business_route.method
    kwargs = {"headers": user.headers}
    if method in {"POST", "PUT", "PATCH"}:
        kwargs["json"] = {}
    return await client.request(method, business_route.url_for(business_id), **kwargs)
