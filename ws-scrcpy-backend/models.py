from pydantic import BaseModel, Field
from typing import List, Dict, Any


class InterfaceInfo(BaseModel):
    name: str
    ipv4: str


class DeviceCreateRequest(BaseModel):
    """专门用于接收客户端数据的模型"""
    udid: str
    # remark: str
    state: str
    interfaces: List[InterfaceInfo]

    # 允许任意额外的字段
    extra_fields: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        extra = "allow"  # 允许额外字段
        allow_population_by_field_name = True