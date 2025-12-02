import asyncio
from contextlib import asynccontextmanager

from sqlalchemy import Column, Integer, String, Text, DateTime, create_engine, select, text, NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import json
from typing import List, Dict, Any, Optional

from database_config import DatabaseSettings
from models import InterfaceInfo

# 数据库模型基类
Base = declarative_base()


class ClientInfo(Base):
    """客户端信息模型"""
    __tablename__ = 'client_info'
    
    id = Column(Integer, primary_key=True, index=True)
    udid = Column(String(255), index=True, unique=True)
    remark = Column(String(255))
    state = Column(String(50))
    interfaces = Column(Text)  # JSON格式存储
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    extra_fields = Column(Text)  # JSON格式存储额外字段

    def __repr__(self):
        return f"<ClientInfo(udid='{self.udid}', state='{self.state}')>"


class DatabaseManager:
    """数据库管理器"""
    instance = None

    def __new__(cls):
        if not cls.instance:
            cls.instance = super(DatabaseManager, cls).__new__(cls)
        return cls.instance

    def __init__(self):
        self.db_settings = DatabaseSettings()
        
        # 配置数据库连接
        self.engine = create_async_engine(
            self.db_settings.DATABASE_URL,
            echo=self.db_settings.DATABASE_ECHO,
            connect_args=self.db_settings.DATABASE_ARGS,
            poolclass=NullPool
        )
            
        self.SessionLocal = async_sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    @asynccontextmanager
    async def get_engine_context(self):
        """用于 DDL 操作（建表、删表等）"""
        async with self.engine.begin() as conn:
            try:
                yield conn
                await conn.commit()
            except Exception as e:
                await conn.rollback()
                raise e

    @asynccontextmanager
    async def get_db_context(self):
        """使用异步上下文管理器"""
        session = self.SessionLocal()
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            raise e
        finally:
            await session.close()

    def init_database(self):
        """安全地初始化数据库"""
        try:
            # 尝试获取当前事件循环
            loop = asyncio.get_event_loop()

            # 检查事件循环是否已在运行
            if loop.is_running():
                # 如果已在运行，创建一个新任务
                asyncio.create_task(self.create_tables())
                print("数据库表将在当前事件循环中创建")
            else:
                # 如果没有运行，则正常运行
                loop.run_until_complete(self.create_tables())
        except RuntimeError:
            # 如果没有事件循环，创建一个新的
            asyncio.run(self.create_tables())
        
    async def create_tables(self):
        """创建所有表"""
        async with self.get_engine_context() as conn:
            # 使用 run_sync 来执行同步的 DDL 操作
            await conn.run_sync(Base.metadata.create_all)
        
    async def get_db_session(self):
        """获取数据库会话"""
        return self.SessionLocal()
        
    async def save_client_info(self, udid: str, state: str, interfaces: List[InterfaceInfo] = None, extra_fields: Optional[Dict[str, Any]] = None):
        """保存客户端信息到数据库"""
        try:
            # 将interfaces和extra_fields转换为JSON字符串存储
            interfaces_json = json.dumps([interface.dict() for interface in interfaces]) if interfaces else "[]"
            extra_fields_json = json.dumps(extra_fields) if extra_fields else "{}"
            
            # 检查是否已存在相同udid的记录
            async with self.get_db_context() as conn:
                existing_record = (await conn.execute(select(ClientInfo).filter(ClientInfo.udid == udid))).first()
                existing_record = existing_record[0] if existing_record else None
            
                if existing_record:
                    # 更新现有记录
                    existing_record.state = state
                    if interfaces_json:
                        existing_record.interfaces = interfaces_json
                    if extra_fields_json:
                        existing_record.extra_fields = extra_fields_json
                else:
                    # 创建新记录
                    db_client_info = ClientInfo(
                        udid=udid,
                        state=state,
                        interfaces=interfaces_json,
                        extra_fields=extra_fields_json
                    )
                    conn.add(db_client_info)
            return True
        except Exception as e:
            print(f"保存客户端信息时出错: {e}")
            return False