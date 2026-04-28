import pytest
from fastapi import HTTPException

from grillmi.security.rate_limit import SlidingWindowLimiter


def test_ip_limiter_blocks_after_5_in_60s():
    limiter = SlidingWindowLimiter(limit=5, window_seconds=60)
    for i in range(5):
        limiter.check_and_record("ip", now=100.0 + i)
    with pytest.raises(HTTPException) as exc:
        limiter.check_and_record("ip", now=110.0)
    assert exc.value.status_code == 429


def test_account_limiter_blocks_after_10_in_3600s():
    limiter = SlidingWindowLimiter(limit=10, window_seconds=3600)
    for i in range(10):
        limiter.check_and_record("acc", now=1.0 + i)
    with pytest.raises(HTTPException):
        limiter.check_and_record("acc", now=20.0)


def test_window_slides_correctly():
    limiter = SlidingWindowLimiter(limit=2, window_seconds=60)
    limiter.check_and_record("k", now=0.0)
    limiter.check_and_record("k", now=10.0)
    with pytest.raises(HTTPException):
        limiter.check_and_record("k", now=15.0)
    # After the window moves past the first entry, room opens up again.
    limiter.check_and_record("k", now=70.0)
