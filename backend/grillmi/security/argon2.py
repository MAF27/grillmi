import asyncio

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)

# Module-load constant kept for timing parity between known and unknown emails.
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing-safety")


async def hash_password(password: str) -> str:
    return await asyncio.to_thread(_hasher.hash, password)


async def verify_password(password_hash: str, password: str) -> bool:
    def _verify() -> bool:
        try:
            return _hasher.verify(password_hash, password)
        except VerifyMismatchError:
            return False
        except Exception:
            return False

    return await asyncio.to_thread(_verify)


async def verify_password_timing_safe(password: str, password_hash: str | None) -> bool:
    """Always runs argon2 verify so missing-account latency matches a real check."""
    if password_hash is None:
        await verify_password(_DUMMY_HASH, password)
        return False
    return await verify_password(password_hash, password)


def check_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)
