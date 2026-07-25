from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SupplySync API"
    environment: str = "development"
    database_url: str = (
        "postgresql+asyncpg://supplysync:supplysync@localhost:5433/supplysync"
    )
    cors_origins: str = "http://localhost:5173"
    business_timezone: str = "Asia/Krasnoyarsk"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
