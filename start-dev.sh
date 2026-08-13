#!/bin/bash

# Alata Studio 开发环境启动脚本

echo "🚀 启动 Alata Studio 开发环境..."

# 停止所有现有进程
echo "📛 停止现有进程..."
pkill -f "node.*index.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 2

# 确保 .env 文件存在
echo "📝 检查环境配置..."
if [ ! -f "server/.env" ]; then
    if [ -f "server/.env.development" ]; then
        echo "   复制 .env.development 到 .env"
        cp server/.env.development server/.env
    else
        echo "❌ 错误：找不到 .env.development 文件"
        exit 1
    fi
fi

# 启动后端
echo "🔧 启动后端服务器..."
cd server
npm run dev > ../logs/server.log 2>&1 &
SERVER_PID=$!
echo "   后端 PID: $SERVER_PID"
cd ..

# 等待后端启动
echo "⏳ 等待后端启动..."
for i in {1..30}; do
    if curl -s http://localhost:3001/api/system/check-token > /dev/null 2>&1; then
        echo "✅ 后端启动成功！"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ 后端启动超时"
        echo "📋 查看日志: tail -f logs/server.log"
        exit 1
    fi
    sleep 1
done

# 启动前端
echo "🎨 启动前端服务器..."
cd frontend
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   前端 PID: $FRONTEND_PID"
cd ..

echo ""
echo "🎉 Alata Studio 开发环境启动完成！"
echo ""
echo "📍 访问地址:"
echo "   前端: http://localhost:3000"
echo "   后端: http://localhost:3001"
echo ""
echo "📋 查看日志:"
echo "   后端: tail -f logs/server.log"
echo "   前端: tail -f logs/frontend.log"
echo ""
echo "🛑 停止服务:"
echo "   kill $SERVER_PID $FRONTEND_PID"
echo ""

