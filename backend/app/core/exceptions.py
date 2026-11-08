"""Custom exception classes for the application."""

from typing import Any, Dict, Optional


class AppException(Exception):
    """Base exception class for application errors."""

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class ResourceNotFoundError(AppException):
    """Raised when a requested resource is not found."""

    def __init__(self, resource: str, identifier: str) -> None:
        super().__init__(
            message=f"{resource} with identifier '{identifier}' not found",
            status_code=404,
            details={"resource": resource, "identifier": identifier},
        )


class PermissionDeniedError(AppException):
    """Raised when user lacks required permission."""

    def __init__(self, required_permission: str) -> None:
        super().__init__(
            message=f"You do not have the required permission: {required_permission}",
            status_code=403,
            details={"required_permission": required_permission},
        )


class RoleDeniedError(AppException):
    def __init__(self, required_role: str) -> None:
        super().__init__(
            message="You do not have access to this action",
            status_code=403,
        )
        self.required_role = required_role  # server logs only (AC-31)


class InvalidTokenError(AppException):
    """Raised when JWT token is invalid or expired."""

    def __init__(self, reason: str = "Invalid or expired token") -> None:
        super().__init__(
            message=reason,
            status_code=401,
            details={"token_error": reason},
        )


class ValidationError(AppException):
    """Raised when data validation fails."""

    def __init__(self, message: str, field: Optional[str] = None) -> None:
        super().__init__(
            message=message,
            status_code=422,
            details={"field": field} if field else {},
        )


class HierarchyViolationError(AppException):
    """Raised when attempting to assign higher privilege role."""

    def __init__(
        self, user_level: int, target_level: int, message: Optional[str] = None
    ) -> None:
        super().__init__(
            message=message or "Cannot assign a role above your own",
            status_code=403,
        )


class DuplicateResourceError(AppException):
    """Raised when attempting to create a duplicate resource."""

    def __init__(self, resource: str, field: str, value: str) -> None:
        super().__init__(
            message=f"{resource} with this {field} already exists",
            status_code=409,
            details={"resource": resource, "field": field},
        )


class ImmutableResourceError(AppException):
    """Raised when attempting to modify immutable system resource."""

    def __init__(
        self,
        resource: str,
        identifier: str,
        reason: str = "System resource is immutable",
    ) -> None:
        super().__init__(
            message=f"Cannot modify {resource} '{identifier}': {reason}",
            status_code=403,
            details={
                "resource": resource,
                "identifier": identifier,
                "reason": reason,
            },
        )


class ConflictError(AppException):
    """409 with a machine-readable code."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message=message, status_code=409, details={"code": code})


class VersionConflictError(ConflictError):
    """The record changed since the client read it (optimistic locking, AC-20)."""

    def __init__(self) -> None:
        super().__init__(
            "This record was changed by someone else. Reload it and try again.",
            "version_conflict",
        )


class IdempotencyKeyRequiredError(AppException):
    def __init__(self) -> None:
        super().__init__(
            message="Idempotency-Key header is required",
            status_code=400,
            details={"code": "idempotency_key_required"},
        )


class IdempotencyKeyReusedError(ConflictError):
    def __init__(self) -> None:
        super().__init__(
            "This Idempotency-Key was already used with a different request",
            "idempotency_key_reused",
        )
