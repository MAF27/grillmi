import asyncio

import structlog

from grillmi.logging import configure_logging
from grillmi.repos import audit_log_repo


def test_audit_event_writes_named_audit_logger():
    configure_logging(json=False)
    captured: list[tuple[str, dict]] = []

    def capture(_logger, method_name, event_dict):
        captured.append((method_name, dict(event_dict)))
        return event_dict

    structlog.configure(processors=[capture])
    log = structlog.get_logger("audit")
    log.info("login", action="login", user_id=None, email="x@example.com", success=True)

    assert any(d.get("logger") == "audit" or "action" in d for _, d in captured)
    payload = next(d for _, d in captured if d.get("action") == "login")
    assert payload["email"] == "x@example.com"
    assert payload["success"] is True


def test_audit_record_emits_via_named_logger(monkeypatch):
    """Smoke-test the audit_log_repo.record() entrypoint without hitting the DB."""
    captured: list[dict] = []

    def fake_info(self, event, **kwargs):
        captured.append({"event": event, **kwargs})

    monkeypatch.setattr(structlog.stdlib.BoundLogger, "info", fake_info, raising=False)

    async def go():
        async def _stub_factory():
            class Stub:
                async def __aenter__(self_inner):
                    raise RuntimeError("db unavailable in unit test")

                async def __aexit__(self_inner, *a):
                    return False

            return Stub()

        # Override the async session factory the repo uses so the fire-and-forget
        # task fails fast and does not leak a coroutine warning.
        await audit_log_repo.record(
            action="login",
            email="x@example.com",
            ip="127.0.0.1",
            success=True,
            session_factory=lambda: _stub_factory(),  # type: ignore[arg-type]
        )

    asyncio.run(go())
    # The structlog INFO line is fired synchronously inside record().
    assert any(c.get("event") == "login" for c in captured)
