import aiosmtplib
from email.message import EmailMessage

from grillmi.config import get_settings


async def send(to: str, subject: str, body_text: str, body_html: str | None = None) -> None:
    settings = get_settings()
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM_ADDRESS
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html is not None:
        msg.add_alternative(body_html, subtype="html")

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        start_tls=True,
        username=settings.HOSTPOINT_SMTP_USER,
        password=settings.HOSTPOINT_SMTP_PASSWORD,
        timeout=30,
    )
