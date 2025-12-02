import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.staticfiles import StaticFiles
import os

from models import DeviceCreateRequest
from multiplexer_advanced import Multiplexer
from websocket_proxy import WebsocketProxy

# 初始化数据库管理器
from database import DatabaseManager
db_manager = DatabaseManager()
# 创建数据库表
db_manager.init_database()


app = FastAPI(title="ws-scrcpy FastAPI Server", version="1.0.0", debug=True)

# 存储活动的WebSocket连接和相关服务
active_connections: dict = {}
device_trackers: dict = {}
websocket_proxies: dict = {}
multiplexers: dict = {}


@app.post("/clientInfo")
async def postClientInfo(data: DeviceCreateRequest):
    data.extra_fields.update(data.model_extra)
    
    # 保存客户端信息到数据库
    try:
        success = await db_manager.save_client_info(
            udid=data.udid,
            state=data.state,
            interfaces=list(data.interfaces),
            extra_fields=data.extra_fields
        )
        if success:
            print(f"客户端信息已保存到数据库: {data.udid}")
        else:
            print(f"保存客户端信息到数据库失败: {data.udid}")
    except Exception as e:
        print(f"保存客户端信息时出错: {e}")
    
    return {"message": data}


@app.put("/clientInfo")
async def putClientInfo(data: DeviceCreateRequest):
    # 保存客户端信息到数据库
    try:
        success = await db_manager.save_client_info(
            udid=data.udid,
            state=data.state
        )
        if success:
            print(f"客户端信息已保存到数据库: {data.udid}")
        else:
            print(f"保存客户端信息到数据库失败: {data.udid}")
    except Exception as e:
        print(f"保存客户端信息时出错: {e}")

    return {"message": data}


@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket, action: str = Query(...)):
    """处理WebSocket连接的主要入口点"""
    await websocket.accept()

    connection_id = f"{websocket.client.host}:{websocket.client.port}"
    active_connections[connection_id] = websocket

    try:
        if action == "proxy_ws":
            # WebSocket代理
            proxy = WebsocketProxy(websocket)
            websocket_proxies[connection_id] = proxy
            await proxy.handle_connection()

        elif action == "multiplex":
            # 多路复用器
            multiplexer = Multiplexer(websocket)
            multiplexers[connection_id] = multiplexer
            await multiplexer.handle_connection()
        else:
            await websocket.close(
                code=4002, reason=f"[WebSocketServer] Unsupported request: {action}"
            )

    except WebSocketDisconnect:
        print(f"客户端 {connection_id} 断开连接")
    except Exception as e:
        print(f"处理WebSocket连接时出错: {e}")
    finally:
        # 清理资源
        cleanup_connection(connection_id)


def cleanup_connection(connection_id: str):
    """清理连接资源"""
    if connection_id in active_connections:
        del active_connections[connection_id]
    if connection_id in device_trackers:
        del device_trackers[connection_id]
    if connection_id in websocket_proxies:
        del websocket_proxies[connection_id]
    if connection_id in multiplexers:
        del multiplexers[connection_id]


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
