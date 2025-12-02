import asyncio
import json
import struct
from typing import Dict, Callable, Union, List

from sqlalchemy import select, ChunkedIteratorResult, update, CursorResult, delete

from database import ClientInfo
from protocols import Message, MessageType
from fastapi import WebSocket

from database import DatabaseManager
db_manager = DatabaseManager()


class Multiplexer:

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.channels: Dict[int, Channel] = {}
        self.next_channel_id = 1
        self.max_channel_id = 4294967296  # 2^32
        self.is_open = True
        self.message_handlers: Dict[MessageType, Callable] = {}

        # 注册默认消息处理器
        self.message_handlers[MessageType.CREATE_CHANNEL] = self._handle_create_channel
        self.message_handlers[MessageType.DATA] = self._handle_data
        self.message_handlers[MessageType.RAW_STRING_DATA] = (
            self._handle_raw_string_data
        )
        self.message_handlers[MessageType.RAW_BINARY_DATA] = (
            self._handle_raw_binary_data
        )
        self.message_handlers[MessageType.CLOSE_CHANNEL] = self._handle_close_channel

    async def handle_connection(self):
        """处理连接"""
        try:
            while self.is_open:
                data = await self.websocket.receive_bytes()
                await self._process_message(data)
        except Exception as e:
            print(f"Multiplexer连接错误: {e}")
            await self.close()

    async def _process_message(self, data: bytes):
        """处理消息"""
        try:
            message = Message.parse(data)
            handler = self.message_handlers.get(message.type)
            if handler:
                await handler(message)
            else:
                print(f"不支持的消息类型: {message.type}")
        except Exception as e:
            print(f"处理消息时出错: {e}")

    async def _handle_create_channel(self, message: Message):
        """处理创建通道消息"""
        if not self.channels.get(message.channel_id):
            channel_id = message.channel_id
            if channel_id == 0:  # 请求创建新通道
                channel_id = self._get_next_channel_id()

            channel = Channel(self, channel_id)
            self.channels[channel_id] = channel

        # 通知通道创建事件
        await self.on_channel_created(self.channels[message.channel_id], message.data)

    async def _handle_data(self, message: Message):
        """处理数据消息"""
        channel = self.channels.get(message.channel_id)
        if channel:
            await channel.on_message(message.data)
        else:
            print(f"找不到通道 {message.channel_id}")

    async def _handle_raw_string_data(self, message: Message):
        """处理原始字符串数据"""
        channel = self.channels.get(message.channel_id)
        if channel:
            # 将字节数据转换为字符串
            try:
                text_data = message.data.decode("utf-8")
                await channel.on_text_message(text_data)
            except UnicodeDecodeError:
                await channel.on_message(message.data)
        else:
            print(f"找不到通道 {message.channel_id}")

    async def _handle_raw_binary_data(self, message: Message):
        """处理原始二进制数据"""
        channel = self.channels.get(message.channel_id)
        if channel:
            await channel.on_message(message.data)
        else:
            print(f"找不到通道 {message.channel_id}")

    async def _handle_close_channel(self, message: Message):
        """处理关闭通道消息"""
        channel = self.channels.get(message.channel_id)
        if channel:
            close_info = message.to_close_event()
            await channel.close(
                close_info.get("code", 1000), close_info.get("reason", "")
            )
            del self.channels[message.channel_id]

    def _get_next_channel_id(self) -> int:
        """获取下一个可用的通道ID"""
        original_id = self.next_channel_id
        while self.next_channel_id in self.channels:
            self.next_channel_id += 1
            if self.next_channel_id >= self.max_channel_id:
                self.next_channel_id = 1
            if self.next_channel_id == original_id:
                raise Exception("没有可用的通道ID")
        return self.next_channel_id

    async def create_channel(self, init_data: bytes = b"") -> "Channel":
        """创建新通道"""
        channel_id = self._get_next_channel_id()
        channel = Channel(self, channel_id)
        self.channels[channel_id] = channel

        # 发送创建通道消息
        create_msg = Message(MessageType.CREATE_CHANNEL, channel_id, init_data)
        await self.send_message(create_msg)

        return channel

    async def send_message(self, message: Message):
        """发送消息"""
        if self.is_open:
            try:
                buffer = message.to_buffer()
                await self.websocket.send_bytes(buffer)
            except Exception as e:
                print(f"发送消息时出错: {e}")
                await self.close()

    async def close(self):
        """关闭多路复用器"""
        if self.is_open:
            self.is_open = False
            for channel in list(self.channels.values()):
                await channel.close(1000, "Multiplexer closed")
            self.channels.clear()
            try:
                await self.websocket.close()
            except:
                pass

    @staticmethod
    async def build_devices_list():
        # 处理数据
        async with await db_manager.get_db_session() as con:
            all: ChunkedIteratorResult = (await con.execute(select(ClientInfo))).fetchall()
            all: List[ClientInfo] = (
                [row[0] if len(row) == 1 else row for row in all]
                if all
                else []
            )
            data = {
                "id": -1,
                "type": "devicelist",
                "data": {
                    "list": [],
                    "id": "56f4e4a86e60eef0f326ee407fa3caf2",
                    "name": "手机远程控制终端"
                }
            }

            for client in all:
                extra = json.loads(client.extra_fields)
                data["data"]["list"].append({
                    "udid": client.udid,
                    "remark": client.remark,
                    "state": client.state,
                    "interfaces": json.loads(client.interfaces),
                    "wifi.interface": extra["wifi.interface"],
                    "pid": extra["pid"],
                    "ro.build.version.release": extra["ro.build.version.release"],
                    "ro.build.version.sdk": extra["ro.build.version.sdk"],
                    "ro.product.manufacturer": extra["ro.product.manufacturer"],
                    "ro.product.model": extra["ro.product.model"],
                    "ro.product.cpu.abi": extra["ro.product.cpu.abi"],
                    "last.update.timestamp": extra["last_update_timestamp"]
                })
            return data

    async def on_channel_created(self, channel: "Channel", message: bytes):
        """通道创建事件 - 子类可以重写"""
        if message == b"HSTS":
            await channel.send(json.dumps({"id":-1,"type":"hosts","data":{"local":[{"type":"android"}],"remote":[]}}))
        elif message == b"GTRC":

            #{"id":-1,"type":"devicelist","data":{"list":[{"udid":"duid1","remark": "测试设备1", "state":"Connected","interfaces":[{"name":"wlan0","ipv4":"10.31.3.118"}],"wifi.interface": "wlan0","pid":20547,"ro.build.version.release":"14","ro.build.version.sdk":"34","ro.product.manufacturer":"Xiaomi","ro.product.model":"2312DRAABC","ro.product.cpu.abi":"arm64-v8a","last.update.timestamp":1761047550321}],"id":"56f4e4a86e60eef0f326ee407fa3caf2","name":"aDevice Tracker [nacs-MacBook-Pro.local]"}}
            await channel.send(json.dumps(await self.build_devices_list()))


class Channel:
    message_handlers = []
    close_handlers = []

    def __init__(self, multiplexer: Multiplexer, channel_id: int):
        self.multiplexer = multiplexer
        self.channel_id = channel_id
        self.is_open = True

    @staticmethod
    def on(event: str, handler: Callable):
        """注册事件处理器"""
        if event == "message":
            Channel.message_handlers.append(handler)
        elif event == "close":
            Channel.close_handlers.append(handler)

    async def send(self, data: Union[str, bytes]):
        """发送数据"""
        if not self.is_open:
            raise Exception("Channel is closed")

        if isinstance(data, str):
            # 发送原始字符串数据
            message = Message(
                MessageType.RAW_STRING_DATA, self.channel_id, data.encode("utf-8")
            )
        else:
            # 发送原始二进制数据
            message = Message(MessageType.RAW_BINARY_DATA, self.channel_id, data)

        await self.multiplexer.send_message(message)

    async def send_data(self, data: bytes):
        """发送数据消息"""
        if not self.is_open:
            raise Exception("Channel is closed")

        message = Message(MessageType.DATA, self.channel_id, data)
        await self.multiplexer.send_message(message)

    async def close(self, code: int = 1000, reason: str = ""):
        """关闭通道"""
        if self.is_open:
            self.is_open = False

            # 通知关闭处理器
            for handler in self.close_handlers:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler({"code": code, "reason": reason})
                    else:
                        handler({"code": code, "reason": reason})
                except Exception as e:
                    print(f"执行关闭处理器时出错: {e}")

            # 发送关闭消息
            close_data = struct.pack("!H", code) + reason.encode("utf-8")
            message = Message(MessageType.CLOSE_CHANNEL, self.channel_id, close_data)
            await self.multiplexer.send_message(message)

    async def on_message(self, data: bytes):
        """处理消息"""
        for handler in self.message_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(data)
                else:
                    handler(data)
            except Exception as e:
                print(f"执行消息处理器时出错: {e}")

    async def on_text_message(self, text: str):
        """处理文本消息"""
        # 默认将文本消息作为普通消息处理
        # await self.on_message(text.encode("utf-8"))
        data = json.loads(text)
        if data["type"] == "update_remark":
            udid = data["data"]["udid"]
            remark = data["data"]["remark"]
            try:
                # 查找设备并更新备注
                async with db_manager.get_db_context() as conn:
                    updated_rows: CursorResult = await conn.execute(update(ClientInfo).where(ClientInfo.udid == udid).values(remark=remark))
                    if updated_rows.rowcount > 0:
                        print(f"设备 {udid} 的备注已更新为: {remark}")
                    else:
                        print(f"未找到设备 {udid} 的记录")
            except Exception as e:
                print(f"无法连接到数据库: {e}")
        elif data["type"] == "remove_device":
            udid = data["data"]["udid"]
            try:
                # 查找设备并删除
                async with db_manager.get_db_context() as conn:
                    deleted_rows: CursorResult = await conn.execute(delete(ClientInfo).where(ClientInfo.udid == udid))
                    if deleted_rows.rowcount > 0:
                        print(f"设备 {udid} 已删除")
                    else:
                        print(f"未找到设备 {udid} 的记录")
            except Exception as e:
                print(f"无法连接到数据库: {e}")


