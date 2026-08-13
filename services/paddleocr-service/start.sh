#!/bin/bash
# PaddleOCR 服务启动脚本
# 用法: ./start.sh [--auto] [port]
# --auto: 非交互模式，自动处理端口占用

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=8866
HOST="127.0.0.1"
AUTO_MODE=false

# 解析参数
for arg in "$@"; do
    if [ "$arg" == "--auto" ]; then
        AUTO_MODE=true
    elif [[ "$arg" =~ ^[0-9]+$ ]]; then
        PORT=$arg
    fi
done

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "❌ Error: Virtual environment not found."
    echo "   Run ./setup.sh first to install dependencies."
    exit 1
fi

# 激活虚拟环境
source venv/bin/activate

# 检查端口是否被占用
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    if [ "$AUTO_MODE" = true ]; then
        echo "⚠️  Port $PORT is already in use. Auto-killing existing process..."
        lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
        sleep 1
        echo "   Killed existing process on port $PORT"
    else
        echo "⚠️  Port $PORT is already in use."
        read -p "   Kill existing process? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
            sleep 1
            echo "   Killed existing process on port $PORT"
        else
            echo "   Exiting..."
            exit 1
        fi
    fi
fi

echo "🚀 Starting PaddleOCR Service..."
echo ""
echo "   URL: http://$HOST:$PORT"
echo "   Docs: http://$HOST:$PORT/docs"
echo ""
echo "   Health check: curl http://$HOST:$PORT/health"
echo "   Setup models: curl -X POST http://$HOST:$PORT/setup"
echo ""
echo "   Press Ctrl+C to stop"
echo ""

# 启动服务
uvicorn app:app --host $HOST --port $PORT --reload

