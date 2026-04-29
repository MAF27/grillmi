from dataclasses import dataclass
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "emails"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(disabled_extensions=("txt",)),
    keep_trailing_newline=True,
)


@dataclass(frozen=True)
class Rendered:
    subject: str
    text: str
    html: str


def _render(text_template: str, html_template: str, subject: str, **ctx: object) -> Rendered:
    text = _env.get_template(text_template).render(**ctx)
    html = _env.get_template(html_template).render(subject=subject, **ctx)
    return Rendered(subject=subject, text=text, html=html)


def render_activation(
    link: str, expires_hours: int, recipient: str, first_name: str | None = None
) -> Rendered:
    return _render(
        "activation.de.txt",
        "activation.de.html",
        subject="Grillmi: Konto aktivieren",
        link=link,
        expires_hours=expires_hours,
        recipient_email=recipient,
        first_name=first_name or "",
    )


def render_reset(
    link: str, expires_minutes: int, recipient: str, first_name: str | None = None
) -> Rendered:
    return _render(
        "password-reset.de.txt",
        "password-reset.de.html",
        subject="Grillmi: Passwort zurücksetzen",
        link=link,
        expires_minutes=expires_minutes,
        recipient_email=recipient,
        first_name=first_name or "",
    )
