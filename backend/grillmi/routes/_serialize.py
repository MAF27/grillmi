from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID


def serialize(row: Any, fields: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for f in fields:
        v = getattr(row, f)
        out[f] = _scalar(v)
    return out


def _scalar(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, Decimal):
        return float(v)
    return v


def parse_since(value: str | None) -> datetime | None:
    if value is None or value == "":
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def server_time_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
