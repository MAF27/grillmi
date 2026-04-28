from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "emails"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(disabled_extensions=("txt",)),
    keep_trailing_newline=True,
)


def render_activation(link: str, expires_hours: int, recipient: str) -> tuple[str, str]:
    body = _env.get_template("activation.de.txt").render(
        link=link, expires_hours=expires_hours, recipient_email=recipient
    )
    return "Grillmi: Konto aktivieren", body


def render_reset(link: str, expires_minutes: int, recipient: str) -> tuple[str, str]:
    body = _env.get_template("password-reset.de.txt").render(
        link=link, expires_minutes=expires_minutes, recipient_email=recipient
    )
    return "Grillmi: Passwort zurücksetzen", body
