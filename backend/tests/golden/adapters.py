"""Document type -> API adapter registry for golden fixtures.

Empty until B1: every fixture reports "not yet supported" (never silently passes).
An adapter is an async callable (client, owner, business_id, fixture) -> posted journal lines.
"""

from collections.abc import Awaitable, Callable

Adapter = Callable[..., Awaitable[list[dict]]]

ADAPTERS: dict[str, Adapter] = {}


def adapter_for(document_type: str) -> Adapter | None:
    return ADAPTERS.get(document_type)
