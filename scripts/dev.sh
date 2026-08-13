#!/bin/bash
# Alata Studio 开发环境一键启动脚本

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 启动 Alata Studio 开发环境${NC}"
echo ""

# 获取脚本所在目录的上级目录（项目根目录）
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 启动 Collector（后台运行）
echo -e "${GREEN}[1/3] 启动 Collector 服务 (端口 8888)...${NC}"
cd "$PROJECT_ROOT/collector" && yarn dev &
COLLECTOR_PID=$!

# 等待 Collector 启动
sleep 2

# 启动 Server（后台运行）
echo -e "${GREEN}[2/3] 启动 Server 服务 (端口 3001)...${NC}"
cd "$PROJECT_ROOT/server" && yarn dev &
SERVER_PID=$!

# 等待 Server 启动
sleep 2

# 启动 Frontend（前台运行）
echo -e "${GREEN}[3/3] 启动 Frontend 服务 (端口 3000)...${NC}"
cd "$PROJECT_ROOT/frontend" && yarn dev

# 当 Frontend 退出时，清理其他进程
echo ""
echo -e "${BLUE}正在停止服务...${NC}"
kill $COLLECTOR_PID 2>/dev/null
kill $SERVER_PID 2>/dev/null
echo -e "${GREEN}✅ 所有服务已停止${NC}"

