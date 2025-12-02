from pydantic_settings import BaseSettings


class DatabaseSettings(BaseSettings):
    """数据库配置设置"""
    DATABASE_URL: str = "sqlite+aiosqlite:///./client_info.db"
    # DATABASE_URL: str = "mysql+aiomysql://root:123456@172.28.16.21:3305/client_info?charset=utf8mb4&autocommit=false"
    DATABASE_ECHO: bool = False
    DATABASE_ARGS: dict = {}
    # DATABASE_ARGS: dict = {'init_command': 'SET SESSION tx_isolation="READ-COMMITTED"'}

    class Config:
        env_file = ".env"
        frozen = True