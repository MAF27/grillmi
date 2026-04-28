import hashlib

import httpx
import pytest

from grillmi.security import hibp


@pytest.mark.asyncio
async def test_known_breached_password_is_flagged(monkeypatch):
    pw = "Password1!"
    sha1 = hashlib.sha1(pw.encode()).hexdigest().upper()
    suffix = sha1[5:]

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None):
            req = httpx.Request("GET", url)
            return httpx.Response(200, request=req, text=f"{suffix}:42\n")

    monkeypatch.setattr(hibp.httpx, "AsyncClient", FakeClient)
    assert await hibp.check_password(pw) is True


@pytest.mark.asyncio
async def test_api_failure_fails_open(monkeypatch):
    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None):
            raise httpx.ConnectError("boom")

    monkeypatch.setattr(hibp.httpx, "AsyncClient", FakeClient)
    assert await hibp.check_password("anything") is False
