# ws-scrcpy-backend Server

这是一个使用FastAPI重新实现的ws-scrcpy服务器端，提供了与原始Node.js版本相似的功能。

## 功能特性

- WebSocket连接管理
- Android和iOS设备跟踪
- WebSocket代理功能
- 多路复用支持（二进制协议）
- 主机跟踪功能
- 设备控制命令处理
- 客户端信息存储到数据库

## 安装

1. 确保已安装Python 3.7+
2. 安装依赖包：

```bash
pip install -r requirements.txt
```

## 数据库配置

默认使用SQLite数据库存储客户端信息。可以通过环境变量配置其他数据库：

```bash
# MySQL示例
DATABASE_URL=mysql+pymysql://username:password@localhost:3306/database_name

# PostgreSQL示例
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
```

## 运行服务器

```bash
python main.py
```

或者使用uvicorn直接运行：

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API端点

### WebSocket端点

- `/ws?action=proxy_ws` - WebSocket代理
- `/ws?action=multiplex` - 多路复用连接（支持二进制协议）
- `/ws?action=goog_device_list` - Android设备列表
- `/ws?action=appl_device_list` - iOS设备列表

### HTTP端点

- `GET /` - 主页
- `POST /clientInfo` - 接收并存储客户端信息到数据库
- `GET /hosts` - 获取主机列表
- `GET /devices/android` - 获取Android设备列表
- `GET /devices/ios` - 获取iOS设备列表

## 项目结构

```
fastapi_server/
├── main.py              # 主应用文件
├── config.py            # 配置模型
├── models.py            # 数据模型
├── protocols.py         # 二进制协议实现
├── device_trackers.py   # 设备跟踪器实现
├── websocket_proxy.py   # WebSocket代理
├── host_tracker.py      # 主机跟踪器
├── multiplexer_advanced.py # 高级多路复用器（支持二进制协议）
├── database.py          # 数据库模型和管理器
├── database_config.py   # 数据库配置
├── requirements.txt     # 依赖包列表
├── Dockerfile           # Docker部署文件
├── README.md            # 说明文档
└── static/              # 静态文件目录
    ├── index.html
    └── images/
```

## 数据库表结构

### client_info 表

| 字段名 | 类型 | 描述 |
|--------|------|------|
| id | Integer | 主键 |
| udid | String(255) | 设备唯一标识 |
| state | String(50) | 设备状态 |
| interfaces | Text | JSON格式存储网络接口信息 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |
| extra_fields | Text | JSON格式存储额外字段 |

## 二进制协议支持

本实现在Node.js版本的基础上实现了完整的二进制协议支持：

### 消息类型

1. `CREATE_CHANNEL` (1) - 创建通道
2. `DATA` (2) - 数据消息
3. `RAW_STRING_DATA` (3) - 原始字符串数据
4. `RAW_BINARY_DATA` (4) - 原始二进制数据
5. `CLOSE_CHANNEL` (5) - 关闭通道

### 通道代码

- `GTRC` - Android设备跟踪器
- `ATRC` - iOS设备跟踪器
- `HSTS` - 主机跟踪器
- `WDAP` - WebDriverAgent代理

## 配置

可以通过环境变量或`.env`文件进行配置。

## 开发

要扩展功能，可以修改相应的模块文件：

1. `device_trackers.py` - 添加真实的设备发现和管理逻辑
2. `websocket_proxy.py` - 实现完整的WebSocket代理功能
3. `multiplexer_advanced.py` - 实现多路复用逻辑
4. `host_tracker.py` - 实现主机跟踪功能
5. `database.py` - 扩展数据库功能

## 与Node.js版本的对比

| 功能 | Node.js版本 | FastAPI版本 |
|------|-------------|-------------|
| WebSocket支持 | ✅ | ✅ |
| 多路复用 | ✅ | ✅ (二进制协议) |
| 二进制协议 | ✅ | ✅ |
| 设备跟踪 | ✅ | ✅ |
| 代理功能 | ✅ | 基本实现 |
| ADB集成 | ✅ | 需要实现 |
| WebDriverAgent集成 | ✅ | 需要实现 |
| 数据库存储 | ❌ | ✅ |

## 注意事项

这个实现目前是一个框架，需要根据实际需求填充具体的设备管理、WebSocket代理等功能的实现细节。特别是：

1. ADB设备发现和管理需要实现
2. WebDriverAgent集成需要实现
3. 实际的设备控制命令处理需要实现
4. 数据库功能需要安装相应的依赖包