from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer


def _datetime_iso(v: datetime | None) -> str | None:
    if v is None:
        return None
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.isoformat()


def _decimal_float(v: Decimal | None) -> float | None:
    return None if v is None else float(v)


DateTimeIso = Annotated[datetime | None, PlainSerializer(_datetime_iso, return_type=str | None)]
DecimalFloat = Annotated[Decimal | None, PlainSerializer(_decimal_float, return_type=float | None)]


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GrilladeOut(_Base):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str | None
    status: str
    target_finish_at: DateTimeIso = None
    started_at: DateTimeIso = None
    ended_at: DateTimeIso = None
    position: float
    created_at: DateTimeIso = None
    updated_at: DateTimeIso = None
    deleted_at: DateTimeIso = None


class GrilladeItemOut(_Base):
    id: uuid.UUID
    grillade_id: uuid.UUID
    label: str
    cut_id: str
    thickness_cm: DecimalFloat = None
    doneness: str | None
    prep_label: str | None
    cook_seconds_min: int
    cook_seconds_max: int
    flip_fraction: DecimalFloat = None
    rest_seconds: int
    status: str
    started_at: DateTimeIso = None
    plated_at: DateTimeIso = None
    alarm_state: dict[str, str | None | dict[str, str | None]] = {}
    position: float
    created_at: DateTimeIso = None
    updated_at: DateTimeIso = None
    deleted_at: DateTimeIso = None


class MenuOut(_Base):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    position: float
    created_at: DateTimeIso = None
    updated_at: DateTimeIso = None
    deleted_at: DateTimeIso = None


class MenuItemOut(_Base):
    id: uuid.UUID
    menu_id: uuid.UUID
    label: str
    cut_id: str
    thickness_cm: DecimalFloat = None
    doneness: str | None
    prep_label: str | None
    position: float
    created_at: DateTimeIso = None
    updated_at: DateTimeIso = None
    deleted_at: DateTimeIso = None


class FavoriteOut(_Base):
    id: uuid.UUID
    user_id: uuid.UUID
    label: str
    cut_id: str
    thickness_cm: DecimalFloat = None
    doneness: str | None
    prep_label: str | None
    position: float
    last_used_at: DateTimeIso = None
    created_at: DateTimeIso = None
    updated_at: DateTimeIso = None
    deleted_at: DateTimeIso = None


class SettingsOut(_Base):
    value: dict[str, Any]
    updated_at: DateTimeIso = None


T = TypeVar("T")


class DeltaResponse(BaseModel, Generic[T]):
    rows: list[T]
    server_time: str


def parse_since(value: str | None) -> datetime | None:
    if value is None or value == "":
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def server_time_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
