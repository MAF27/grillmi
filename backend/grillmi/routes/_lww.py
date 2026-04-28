from datetime import datetime, timezone
from typing import Any


def request_is_older(request_value: Any, persisted: datetime | None) -> bool:
    if request_value is None or persisted is None:
        return False
    if isinstance(request_value, datetime):
        r = request_value
    else:
        r = datetime.fromisoformat(str(request_value).replace("Z", "+00:00"))
    if r.tzinfo is None:
        r = r.replace(tzinfo=timezone.utc)
    p = persisted if persisted.tzinfo else persisted.replace(tzinfo=timezone.utc)
    return r < p
