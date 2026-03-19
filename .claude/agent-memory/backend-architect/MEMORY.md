# Backend Architect Memory

## Schema Architecture (2026-02-06 Refactor)
- Schemas split into `schemas/request/` and `schemas/response/` directories
- Old flat files (`schemas/role.py`, etc.) are backward-compat re-export wrappers
- Naming: `Create{Resource}Request`, `Update{Resource}Request` for inputs
- Naming: `{Resource}Response`, `{Resource}WithPermissionsResponse` for outputs
- `schemas/common.py` has: TimestampSchema, CreatedAtSchema, PaginatedResponse, ErrorResponse
- `schemas/auth.py` stays flat (used by dependencies, not a resource)

## Route Rules
- Every route MUST have `response_model` from `schemas/response/`
- Every route MUST have permission guard via `dependencies=[Depends(require_permission(...))]`
- Read-only routes don't need `current_user` param (permission checked in `dependencies=[]`)
- POST creation uses `status_code=status.HTTP_201_CREATED`
- DELETE uses `status_code=status.HTTP_204_NO_CONTENT`
- Routes delegate to services, NO business logic in routes

## Error Handling
- All errors follow `ErrorResponse` shape: `{error, status_code, details}`
- Exception hierarchy in `core/exceptions.py` (7 specific exception types)
- Exception handlers in `main.py` convert to JSONResponse with ErrorResponse shape

## Layered Architecture
- Router -> Service -> Repository -> Model -> Database (NO shortcuts)
- Services take `AsyncSession` in constructor, create their own repository instances
- BaseRepository provides generic CRUD; specific repos extend it
- UserRepository is special: raw SQL against auth.users (no ORM model for auth.users)

## Key Patterns
- `session_manager.session()` handles commit/rollback automatically
- `get_db()` dependency yields session from session_manager
- `require_permission()` is a factory that returns a dependency function
- Audit logging done in routes after service calls (not in services)
- `is_system` flag on roles prevents modification of system roles

## Imports
```python
# Routes: import from specific modules
from app.schemas.request.role import CreateRoleRequest
from app.schemas.response.role import RoleResponse

# Services: import request schemas for type hints
from app.schemas.request.role import CreateRoleRequest

# Tests: old imports still work via re-export wrappers
from app.schemas.role import RoleCreate  # alias for CreateRoleRequest
```

## File Counts
- 10 route files, 7 services, 8 repositories, 7 models
- 5 request schemas, 8 response schemas, + common.py + auth.py
- 27 total FastAPI routes
