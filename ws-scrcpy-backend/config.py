from pydantic_settings import BaseSettings
from pydantic import BaseModel
from typing import List, Optional


class ServerItem(BaseModel):
    secure: bool = False
    port: int = 8000
    options: Optional[dict] = None
    redirectToSecure: bool = False

    class Config:
        frozen = True


class HostItem(BaseModel):
    hostname: str
    port: int
    pathname: str
    secure: bool
    useProxy: bool
    type: str

    class Config:
        frozen = True


class Settings(BaseSettings):
    runGoogTracker: bool = True
    runApplTracker: bool = True
    announceGoogTracker: bool = True
    announceApplTracker: bool = True
    server: List[ServerItem] = [ServerItem()]
    remoteHostList: List[HostItem] = []

    class Config:
        env_file = ".env"
        frozen = True