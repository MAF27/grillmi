import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, status


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self._limit = limit
        self._window = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check_and_record(self, key: str, now: float | None = None) -> None:
        ts = now if now is not None else time.monotonic()
        with self._lock:
            events = self._events[key]
            cutoff = ts - self._window
            while events and events[0] < cutoff:
                events.popleft()
            if len(events) >= self._limit:
                retry_after = int(self._window - (ts - events[0])) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="rate_limited",
                    headers={"Retry-After": str(max(retry_after, 1))},
                )
            events.append(ts)

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


login_ip_limiter = SlidingWindowLimiter(limit=5, window_seconds=60)
login_account_limiter = SlidingWindowLimiter(limit=10, window_seconds=3600)
