"""Route inventory checks that do not need a database (CS-12, AC-25, AC-19)."""

import typing

from fastapi.dependencies.utils import get_flat_dependant
from fastapi.routing import APIRoute

from app.core.config import settings
from app.core.dependencies import get_db, require_idempotency_key
from app.main import app

PAGINATION_PARAMS = {"page", "page_size"}
# POST routes that create a record: they must take an Idempotency-Key (AC-19).
CREATE_SUFFIXES = (
    "/businesses", "/customers", "/suppliers", "/bank-accounts", "/receipts",
    "/chart-of-accounts/groups", "/chart-of-accounts/accounts", "/members",
    "/journal-entries", "/journal-entries/{document_id}/post", "/journal-entries/{document_id}/void",
    # B3
    "/payments", "/inter-account-transfers", "/capital-accounts", "/attachments",
    "/receipts/{document_id}/post", "/receipts/{document_id}/void",
    "/payments/{document_id}/post", "/payments/{document_id}/void",
    "/inter-account-transfers/{document_id}/post", "/inter-account-transfers/{document_id}/void",
)


def _routes() -> list[APIRoute]:
    return [r for r in app.routes if isinstance(r, APIRoute)]


def _is_list_response(route: APIRoute) -> bool:
    model = route.response_model
    if typing.get_origin(model) is list:
        return True
    return "items" in getattr(model, "model_fields", {})


def _calls(route: APIRoute) -> set:
    stack, calls = list(route.dependant.dependencies), set()
    while stack:
        dependant = stack.pop()
        calls.add(dependant.call)
        stack.extend(dependant.dependencies)
    return calls


def _query_params(route: APIRoute) -> dict:
    return {p.name: p for p in get_flat_dependant(route.dependant).query_params}


def test_every_list_route_is_paginated():
    list_routes = [r for r in _routes() if "GET" in r.methods and _is_list_response(r)]
    unpaginated = [r.path for r in list_routes if not PAGINATION_PARAMS <= set(_query_params(r))]
    assert list_routes and unpaginated == []


def test_page_size_capped_at_max_on_every_list_route():
    for route in _routes():
        page_size = _query_params(route).get("page_size")
        if page_size is None:
            continue
        limits = {type(m).__name__: m for m in page_size.field_info.metadata}
        assert limits["Le"].le == settings.PAGE_SIZE_MAX, route.path


def test_no_list_route_returns_a_bare_array():
    assert [r.path for r in _routes() if typing.get_origin(r.response_model) is list] == []


def test_create_routes_require_idempotency_key():
    creates = [r for r in _routes() if "POST" in r.methods and r.path.endswith(CREATE_SUFFIXES)]
    missing = [r.path for r in creates if require_idempotency_key not in _calls(r)]
    assert len(creates) == len(CREATE_SUFFIXES) and missing == []


def test_every_db_session_commits_before_the_response():
    """B1 race fix: get_db is function-scoped everywhere, so COMMIT runs before the reply."""
    request_scoped = []
    for route in _routes():
        stack = list(route.dependant.dependencies)
        while stack:
            dependant = stack.pop()
            if dependant.call is get_db and dependant.scope != "function":
                request_scoped.append(route.path)
            stack.extend(dependant.dependencies)
    assert request_scoped == []
