"""Idempotency-Key handling for create/post routes (B0.5, CS-11, AC-19).

The key row is inserted in the same transaction as the create it guards:
  new key            -> run the create, store (status, body), return it;
  same key + body    -> return the stored response, nothing is created again;
  same key, new body -> 409 idempotency_key_reused.
A concurrent duplicate blocks on the unique index until the first commits, then replays.
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import IdempotencyKeyReusedError
from app.repositories.idempotency_repository import IdempotencyRepository


@dataclass(frozen=True)
class IdempotencyScope:
    key: str
    user_id: str
    business_id: str | None
    area_key: str | None
    route: str


def request_hash(scope: IdempotencyScope, payload: BaseModel) -> str:
    canonical = json.dumps(
        {"route": scope.route, "body": payload.model_dump(mode="json")},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class IdempotencyService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = IdempotencyRepository(session)

    async def run(
        self,
        scope: IdempotencyScope,
        payload: BaseModel,
        create: Callable[[], Awaitable[BaseModel]],
        status_code: int = 201,
    ) -> BaseModel | JSONResponse:
        digest = request_hash(scope, payload)
        now = datetime.now(timezone.utc)
        await self.repo.delete_expired(scope.business_id, scope.user_id, scope.key, now)
        key_id = await self.repo.claim({
            "business_id": scope.business_id,
            "user_id": scope.user_id,
            "key": scope.key,
            "area_key": scope.area_key,
            "request_hash": digest,
            "expires_at": now + timedelta(hours=settings.IDEMPOTENCY_TTL_HOURS),
        })
        if key_id is None:
            return await self._replay(scope, digest)
        result = await create()
        await self.repo.complete(key_id, status_code, result.model_dump(mode="json"))
        return result

    async def _replay(self, scope: IdempotencyScope, digest: str) -> JSONResponse:
        stored = await self.repo.get(scope.business_id, scope.user_id, scope.key)
        if stored is None or stored.request_hash != digest or stored.response_status is None:
            raise IdempotencyKeyReusedError()
        return JSONResponse(status_code=stored.response_status, content=stored.response_body)


def business_scope(ctx, key: str, area_key: str, route: str) -> IdempotencyScope:
    """Scope of a create inside a business (ctx: the verified BusinessContext)."""
    return IdempotencyScope(key, ctx.user_id, ctx.business_id, area_key, route)
