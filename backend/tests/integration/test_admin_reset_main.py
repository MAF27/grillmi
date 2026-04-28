from __future__ import annotations

import io

import pytest

from grillmi.cli import admin_init, admin_reset


async def test_admin_reset_no_user_returns_2(db_session) -> None:
    rc = await admin_reset._run("nobody-on-disk@example.com", "long-enough-passw0rd")
    assert rc == 2


def test_admin_reset_main_short_password(monkeypatch) -> None:
    monkeypatch.setattr(
        "sys.argv",
        ["grillmi-admin-reset", "--email", "x@example.com", "--password-stdin"],
    )
    monkeypatch.setattr("sys.stdin", io.StringIO("short\n"))
    with pytest.raises(SystemExit) as exc:
        admin_reset.main()
    assert exc.value.code == 2


def test_admin_init_main_invokes_run(monkeypatch) -> None:
    called: dict = {}

    async def fake_run(email: str) -> int:
        called["email"] = email
        return 0

    def fake_asyncio_run(coro):
        # Drive the coroutine to completion without touching the
        # session-scope event loop pytest-asyncio owns.
        try:
            coro.send(None)
        except StopIteration as e:
            return e.value
        return 0

    monkeypatch.setattr(admin_init, "_run", fake_run)
    monkeypatch.setattr(admin_init.asyncio, "run", fake_asyncio_run)
    monkeypatch.setattr("sys.argv", ["grillmi-admin-init", "--email", "a@b.com"])
    with pytest.raises(SystemExit) as exc:
        admin_init.main()
    assert exc.value.code == 0
    assert called["email"] == "a@b.com"


def test_admin_reset_main_invokes_run_via_stdin(monkeypatch) -> None:
    called: dict = {}

    async def fake_run(email: str, password: str) -> int:
        called["email"] = email
        called["password"] = password
        return 0

    def fake_asyncio_run(coro):
        try:
            coro.send(None)
        except StopIteration as e:
            return e.value
        return 0

    monkeypatch.setattr(admin_reset, "_run", fake_run)
    monkeypatch.setattr(admin_reset.asyncio, "run", fake_asyncio_run)
    monkeypatch.setattr(
        "sys.argv",
        ["grillmi-admin-reset", "--email", "x@y.com", "--password-stdin"],
    )
    monkeypatch.setattr("sys.stdin", io.StringIO("very-good-passw0rd\n"))
    with pytest.raises(SystemExit) as exc:
        admin_reset.main()
    assert exc.value.code == 0
    assert called["email"] == "x@y.com"
    assert called["password"] == "very-good-passw0rd"
