"""Route inventory checks that do not need a database."""

import typing

import pytest
from fastapi.routing import APIRoute

from app.main import app

PAGINATION_PARAMS = {"page", "page_size", "limit", "cursor"}


def _is_list_response(route: APIRoute) -> bool:
    model = route.response_model
    if typing.get_origin(model) is list:
        return True
    fields = getattr(model, "model_fields", {})
    return "items" in fields


def _list_routes() -> list[APIRoute]:
    return [
        r
        for r in app.routes
        if isinstance(r, APIRoute) and "GET" in r.methods and _is_list_response(r)
    ]


@pytest.mark.xfail(strict=True, reason="CS-12: most list routes are unpaginated (B0.3/B0.5)")
def test_every_list_route_is_paginated():
    unpaginated = [
        r.path
        for r in _list_routes()
        if not PAGINATION_PARAMS & {p.name for p in r.dependant.query_params}
    ]
    assert unpaginated == []
