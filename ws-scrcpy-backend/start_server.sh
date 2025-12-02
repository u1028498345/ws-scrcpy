#!/bin/bash

# 安装依赖
echo "安装依赖..."
pip install -r requirements.txt

# 启动服务器
echo "启动FastAPI服务器..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload