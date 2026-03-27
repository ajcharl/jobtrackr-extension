from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://jobtrackr:jobtrackr@localhost:5432/jobtrackr"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "chrome-extension://*",
    ]

    # Gmail OAuth settings
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/gmail/callback"

    # Yahoo OAuth settings
    yahoo_client_id: str = ""
    yahoo_client_secret: str = ""
    yahoo_redirect_uri: str = "http://localhost:8000/yahoo/callback"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
