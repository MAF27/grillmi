import pytest

from grillmi.security.argon2 import (
    check_needs_rehash,
    hash_password,
    verify_password,
    verify_password_timing_safe,
)


@pytest.mark.asyncio
async def test_hash_then_verify_succeeds():
    h = await hash_password("correct horse battery staple")
    assert await verify_password(h, "correct horse battery staple") is True
    assert await verify_password(h, "") is False


@pytest.mark.asyncio
async def test_dummy_hash_verify_returns_false_with_unknown_email():
    # When no user is found, password_hash is None and the function still
    # exercises argon2 via the dummy hash so timing matches the real path.
    assert await verify_password_timing_safe("anything", None) is False


@pytest.mark.asyncio
async def test_check_needs_rehash_after_param_change(monkeypatch):
    h = await hash_password("password 12345")
    assert check_needs_rehash(h) is False

    # Swap the module hasher for one with stronger params; the previous hash
    # should now request a rehash.
    from argon2 import PasswordHasher

    import grillmi.security.argon2 as mod

    monkeypatch.setattr(
        mod, "_hasher", PasswordHasher(time_cost=4, memory_cost=131072, parallelism=4)
    )
    assert check_needs_rehash(h) is True
