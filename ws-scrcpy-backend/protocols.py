import struct
from enum import Enum
from typing import Union, Optional
import json


class MessageType(Enum):
    CREATE_CHANNEL = 4
    CLOSE_CHANNEL = 8
    RAW_BINARY_DATA = 16
    RAW_STRING_DATA = 32
    DATA = 64


class Message:
    def __init__(self, type: MessageType, channel_id: int = 0, data: Union[bytes, str] = b""):
        self.type = type
        self.channel_id = channel_id
        self.data = data

    @staticmethod
    def parse(data: Union[bytes, str]) -> "Message":
        """解析消息"""
        if isinstance(data, str):
            # JSON格式的消息
            try:
                json_data = json.loads(data)
                msg = Message(MessageType.DATA, 0, data.encode("utf-8"))
                # 这里可以根据JSON结构进一步解析
                return msg
            except json.JSONDecodeError:
                # 如果不是有效的JSON，当作原始字符串处理
                return Message(MessageType.RAW_STRING_DATA, 0, data.encode("utf-8"))

        # 二进制格式的消息
        if len(data) < 8:
            raise ValueError("Message too short")

        # 解析头部 (type: 4 bytes, channel_id: 4 bytes)
        type_int = data[0]
        channel_id = struct.unpack("<I", data[1:5])[0]
        message_type = MessageType(type_int)
        message_data = data[5:]

        return Message(message_type, channel_id, message_data)

    def to_buffer(self) -> bytes:
        """将消息转换为二进制缓冲区"""
        header = self.type.value.to_bytes(1, "little") + self.channel_id.to_bytes(4, "little")
        return header + self.data

    @staticmethod
    def create_buffer(type: MessageType, channel_id: int, data: bytes) -> bytes:
        """创建消息缓冲区"""
        header = struct.pack("!II", type.value, channel_id)
        return header + data

    def to_close_event(self):
        """转换为关闭事件"""
        # 解析关闭代码和原因
        if len(self.data) >= 2:
            code = struct.unpack("!H", self.data[:2])[0]
            reason = self.data[2:].decode("utf-8") if len(self.data) > 2 else ""
            return {"code": code, "reason": reason}
        return {"code": 1000, "reason": ""}
