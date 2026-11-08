"""Dashboard response schemas for API output serialization."""

from pydantic import BaseModel


class DashboardStatsResponse(BaseModel):
    """The caller's own numbers (CS-21): never platform-wide counts."""

    total_businesses: int
    total_audit_logs: int
    recent_activity_24h: int
