import asyncio

from structlog.testing import capture_logs

from grillmi.logging import configure_logging, get_audit_logger
from grillmi.repos import audit_log_repo


def test_audit_event_writes_named_audit_logger():
    configure_logging(json=False)
    with capture_logs() as cap:
        log = get_audit_logger()
        log.info("login", action="login", user_id=None, email="x@example.com", success=True)

    payload = next(d for d in cap if d.get("action") == "login")
    assert payload["email"] == "x@example.com"
    assert payload["success"] is True


def test_audit_record_emits_via_named_logger():
    """Smoke-test the audit_log_repo.record() entrypoint without hitting the DB."""
    configure_logging(json=False)

    class _StubSession:
        async def __aenter__(self):
            raise RuntimeError("db unavailable in unit test")

        async def __aexit__(self, *a):
            return False

    def _stub_factory():
        return _StubSession()

    async def go():
        with capture_logs() as cap:
            await audit_log_repo.record(
                action="login",
                email="x@example.com",
                ip="127.0.0.1",
                success=True,
                session_factory=_stub_factory,
            )
            # Allow the fire-and-forget DB task to run and fail through the
            # exception branch so its log line is captured too.
            await asyncio.sleep(0)
        return cap

    cap = asyncio.run(go())
    assert any(c.get("action") == "login" for c in cap)
