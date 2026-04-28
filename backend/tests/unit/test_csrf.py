from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from grillmi.security.csrf import validate_csrf


def _request(method: str, header: str | None) -> SimpleNamespace:
    headers = {"X-CSRFToken": header} if header is not None else {}
    return SimpleNamespace(method=method, headers=headers)


def test_csrf_passes_when_header_matches_session_token():
    session = SimpleNamespace(csrf_token="abc123")
    assert validate_csrf(_request("POST", "abc123"), session) is None


def test_csrf_rejects_when_header_missing():
    session = SimpleNamespace(csrf_token="abc123")
    with pytest.raises(HTTPException) as exc:
        validate_csrf(_request("POST", None), session)
    assert exc.value.status_code == 403


def test_csrf_exempts_get_head_options():
    session = SimpleNamespace(csrf_token="abc")
    for method in ("GET", "HEAD", "OPTIONS"):
        assert validate_csrf(_request(method, None), session) is None
