import hashlib

import httpx
import structlog

from grillmi.config import get_settings

_log = structlog.get_logger("hibp")


async def check_password(password: str) -> bool:
    """Returns True if HIBP reports this password as breached. Fail-open on errors."""
    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    headers = {"User-Agent": get_settings().HIBP_USER_AGENT, "Add-Padding": "true"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"https://api.pwnedpasswords.com/range/{prefix}", headers=headers
            )
            r.raise_for_status()
    except Exception as exc:
        _log.warning("hibp_unreachable", error=str(exc))
        return False
    for line in r.text.splitlines():
        candidate, _, count_str = line.partition(":")
        if candidate.strip() == suffix and count_str.strip() not in ("", "0"):
            return True
    return False
