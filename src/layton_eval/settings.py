import os
from pathlib import Path

from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    root_dir: Path = Path(__file__).resolve().parent.parent.parent
    model_config = SettingsConfigDict(env_file=os.path.join(root_dir, ".env"), extra="allow")


settings: Settings = Settings()
