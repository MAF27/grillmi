from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=True)

    APP_ENV: str = Field(..., description="dev or prod")
    PUBLIC_BASE_URL: str

    DATABASE_HOST: str
    DATABASE_PORT: int
    DATABASE_NAME: str
    DATABASE_USER: str
    DATABASE_PASSWORD: str

    SMTP_HOST: str
    SMTP_PORT: int
    SMTP_FROM_ADDRESS: str
    HOSTPOINT_SMTP_USER: str
    HOSTPOINT_SMTP_PASSWORD: str

    HIBP_USER_AGENT: str = "Grillmi/1.0 (homelab)"

    SESSION_MAX_AGE_HOURS: int = 24
    SESSION_COOKIE_NAME: str = "grillmi_session"

    RATE_LIMIT_LOGIN_IP_PER_MIN: int = 5
    RATE_LIMIT_LOGIN_ACCOUNT_PER_HOUR: int = 10

    AUDIT_RETENTION_DAYS: int = 365
    TOMBSTONE_RETENTION_DAYS: int = 30

    OPENAPI_ENABLED: bool = False

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.DATABASE_USER}:{self.DATABASE_PASSWORD}"
            f"@{self.DATABASE_HOST}:{self.DATABASE_PORT}/{self.DATABASE_NAME}"
        )

    @property
    def IS_PROD(self) -> bool:
        return self.APP_ENV == "prod"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
