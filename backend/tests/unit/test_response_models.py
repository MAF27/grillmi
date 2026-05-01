from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from grillmi.routes._models import (
    DeltaResponse,
    GrilladeItemOut,
    GrilladeOut,
    parse_since,
    server_time_iso,
)


class _FakeRow:
    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


def test_grillade_out_serializes_datetimes_as_iso8601_with_timezone():
    row = _FakeRow(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        user_id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        name="Sunday",
        status="planned",
        target_finish_at=datetime(2024, 5, 1, 16, 0, 0, tzinfo=timezone.utc),
        started_at=None,
        ended_at=None,
        position=1.0,
        created_at=datetime(2024, 5, 1, 15, 0, 0, tzinfo=timezone.utc),
        updated_at=datetime(2024, 5, 1, 15, 58, 20, tzinfo=timezone.utc),
        deleted_at=None,
    )
    dumped = GrilladeOut.model_validate(row).model_dump(mode="json")
    assert dumped["target_finish_at"] == "2024-05-01T16:00:00+00:00"
    assert dumped["updated_at"] == "2024-05-01T15:58:20+00:00"
    assert dumped["started_at"] is None


def test_grillade_out_naive_datetime_gets_utc_appended():
    row = _FakeRow(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        user_id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        name=None,
        status="finished",
        target_finish_at=None,
        started_at=None,
        ended_at=None,
        position=0.0,
        created_at=datetime(2024, 5, 1, 15, 0, 0),
        updated_at=datetime(2024, 5, 1, 15, 58, 20),
        deleted_at=None,
    )
    dumped = GrilladeOut.model_validate(row).model_dump(mode="json")
    assert dumped["created_at"] == "2024-05-01T15:00:00+00:00"
    assert dumped["updated_at"] == "2024-05-01T15:58:20+00:00"


def test_grillade_out_serializes_uuid_id():
    row = _FakeRow(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        user_id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        name="x",
        status="planned",
        target_finish_at=None,
        started_at=None,
        ended_at=None,
        position=1.5,
        created_at=None,
        updated_at=None,
        deleted_at=None,
    )
    dumped = GrilladeOut.model_validate(row).model_dump(mode="json")
    assert dumped["id"] == "11111111-1111-1111-1111-111111111111"
    assert dumped["user_id"] == "22222222-2222-2222-2222-222222222222"
    assert dumped["position"] == 1.5


def test_grillade_item_out_serializes_decimal_as_float():
    row = _FakeRow(
        id=uuid.UUID("33333333-3333-3333-3333-333333333333"),
        grillade_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        label="Ribeye",
        cut_id="ribeye",
        thickness_cm=Decimal("2.5"),
        doneness="medium",
        prep_label=None,
        cook_seconds_min=240,
        cook_seconds_max=360,
        flip_fraction=Decimal("0.5"),
        rest_seconds=120,
        status="pending",
        started_at=None,
        plated_at=None,
        position=0.0,
        created_at=None,
        updated_at=None,
        deleted_at=None,
    )
    dumped = GrilladeItemOut.model_validate(row).model_dump(mode="json")
    assert dumped["thickness_cm"] == 2.5
    assert isinstance(dumped["thickness_cm"], float)
    assert dumped["flip_fraction"] == 0.5
    assert isinstance(dumped["flip_fraction"], float)


def test_delta_response_wraps_rows_and_server_time():
    row = _FakeRow(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        user_id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        name="x",
        status="planned",
        target_finish_at=None,
        started_at=None,
        ended_at=None,
        position=0.0,
        created_at=None,
        updated_at=None,
        deleted_at=None,
    )
    payload = DeltaResponse[GrilladeOut](
        rows=[GrilladeOut.model_validate(row)],
        server_time="2024-05-01T16:00:00+00:00",
    )
    dumped = json.loads(payload.model_dump_json())
    assert dumped["server_time"] == "2024-05-01T16:00:00+00:00"
    assert len(dumped["rows"]) == 1
    assert dumped["rows"][0]["id"] == "11111111-1111-1111-1111-111111111111"


def test_parse_since_handles_null_empty_and_iso_variants():
    assert parse_since(None) is None
    assert parse_since("") is None
    out_z = parse_since("2024-05-01T16:00:00Z")
    assert out_z == datetime(2024, 5, 1, 16, 0, 0, tzinfo=timezone.utc)
    out_offset = parse_since("2024-05-01T16:00:00+00:00")
    assert out_offset == datetime(2024, 5, 1, 16, 0, 0, tzinfo=timezone.utc)


def test_server_time_iso_returns_tz_aware_iso_string():
    out = server_time_iso()
    parsed = datetime.fromisoformat(out)
    assert parsed.tzinfo is not None
