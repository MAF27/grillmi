import pytest

from grillmi.email import sender


@pytest.mark.asyncio
async def test_send_calls_aiosmtplib_with_starttls(monkeypatch):
    captured: dict = {}

    async def fake_send(message, **kwargs):
        captured["message"] = message
        captured.update(kwargs)

    monkeypatch.setattr(sender.aiosmtplib, "send", fake_send)
    await sender.send("to@example.com", "Hello", "Body")

    assert captured["start_tls"] is True
    assert captured["hostname"]
    assert captured["port"]
    assert captured["username"]
    msg = captured["message"]
    assert msg["To"] == "to@example.com"
    assert msg["Subject"] == "Hello"
    assert msg["From"]
