#!/bin/bash

# Alata Studio + Ollama 一键启动脚本
# 用途：快速部署 Alata Studio 与本地 LLM（Ollama）
#
# ⚠️ 仅建议用于本地/自建模型环境。
# ⚠️ 腾讯云等云端部署请不要使用该脚本（推荐直接配置云端 LLM API Key）。

set -e  # 遇到错误立即退出

# 非交互环境下直接退出，避免 CI/远程误触发
if [[ ! -t 0 ]]; then
  echo "[start-with-ollama] This script is intended for interactive local use only." >&2
  echo "[start-with-ollama] For cloud deployments, configure API keys and use docker-compose.cloud.single-node*.yml." >&2
  exit 2
fi

# 二次确认，防止在云端误用
echo ""
echo "This will start Ollama locally (NOT recommended for cloud)."
read -p "Type 'YES' to continue: " -r confirm
if [[ "$confirm" != "YES" ]]; then
  echo "Aborted."
  exit 1
fi

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查 Docker
check_docker() {
    print_header "检查 Docker 环境"
    
    if ! command_exists docker; then
        print_error "Docker 未安装"
        print_info "请访问 https://docs.docker.com/get-docker/ 安装 Docker"
        exit 1
    fi
    
    print_success "Docker 已安装: $(docker --version)"
    
    # 检查 Docker 是否运行
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker 未运行"
        print_info "请启动 Docker 服务"
        exit 1
    fi
    
    print_success "Docker 服务正常运行"
}

# 检查 Docker Compose
check_docker_compose() {
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        print_error "Docker Compose 未安装"
        print_info "请访问 https://docs.docker.com/compose/install/ 安装 Docker Compose"
        exit 1
    fi
    
    if command_exists docker-compose; then
        print_success "Docker Compose 已安装: $(docker-compose --version)"
        COMPOSE_CMD="docker-compose"
    else
        print_success "Docker Compose 已安装: $(docker compose version)"
        COMPOSE_CMD="docker compose"
    fi
}

# 检查 GPU 支持
check_gpu() {
    print_header "检查 GPU 支持"
    
    if command_exists nvidia-smi; then
        print_success "检测到 NVIDIA GPU"
        nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
        
        # 检查 NVIDIA Container Toolkit
        if docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi >/dev/null 2>&1; then
            print_success "NVIDIA Container Toolkit 已安装"
            GPU_AVAILABLE=true
        else
            print_warning "NVIDIA Container Toolkit 未安装"
            print_info "GPU 加速将不可用，将使用 CPU 模式"
            GPU_AVAILABLE=false
        fi
    else
        print_info "未检测到 NVIDIA GPU，将使用 CPU 模式"
        GPU_AVAILABLE=false
    fi
}

# 拉取 Docker 镜像
pull_images() {
    print_header "拉取 Docker 镜像"
    
    print_info "拉取 Ollama 镜像..."
    docker pull ollama/ollama:latest
    print_success "Ollama 镜像拉取完成"
    
    print_info "拉取 Alata Studio 镜像..."
    docker pull mintplexlabs/anythingllm:latest
    print_success "Alata Studio 镜像拉取完成"
}

# 启动服务
start_services() {
    print_header "启动服务"
    
    # 切换到 docker 目录
    cd "$(dirname "$0")/.."
    
    print_info "启动 Ollama 和 Alata Studio..."
    $COMPOSE_CMD -f docker-compose.ollama.yml up -d
    
    print_success "服务启动成功"
}

# 等待服务就绪
wait_for_services() {
    print_header "等待服务就绪"
    
    print_info "等待 Ollama 启动..."
    for i in {1..30}; do
        if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
            print_success "Ollama 已就绪"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
    
    print_info "等待 Alata Studio 启动..."
    for i in {1..60}; do
        if curl -s http://localhost:3001/api/ping >/dev/null 2>&1; then
            print_success "Alata Studio 已就绪"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
}

# 下载推荐模型
download_models() {
    print_header "下载推荐模型"
    
    print_warning "首次启动需要下载模型，可能需要 5-15 分钟"
    print_info "您可以选择跳过此步骤，稍后手动下载"
    
    read -p "是否现在下载模型？(y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 调用模型下载脚本
        bash "$(dirname "$0")/download-models.sh"
    else
        print_info "跳过模型下载"
        print_info "稍后可运行以下命令下载模型："
        print_info "  bash docker/scripts/download-models.sh"
    fi
}

# 显示访问信息
show_access_info() {
    print_header "部署完成"
    
    print_success "Alata Studio 已成功启动！"
    echo ""
    print_info "访问地址："
    echo -e "  ${GREEN}🌐 Alata Studio: http://localhost:3001${NC}"
    echo -e "  ${GREEN}🤖 Ollama API:   http://localhost:11434${NC}"
    echo ""
    print_info "常用命令："
    echo "  查看日志:   $COMPOSE_CMD -f docker-compose.ollama.yml logs -f"
    echo "  停止服务:   $COMPOSE_CMD -f docker-compose.ollama.yml down"
    echo "  重启服务:   $COMPOSE_CMD -f docker-compose.ollama.yml restart"
    echo "  下载模型:   bash docker/scripts/download-models.sh"
    echo ""
    print_info "文档："
    echo "  本地 LLM 部署: docs/zh-CN/LOCAL_LLM_DEPLOYMENT.md"
    echo "  Ollama 配置:   docs/zh-CN/OLLAMA_SETUP.md"
    echo "  故障排查:      docs/zh-CN/TROUBLESHOOTING.md"
    echo ""
}

# 主函数
main() {
    print_header "Alata Studio + Ollama 一键部署"
    
    # 检查环境
    check_docker
    check_docker_compose
    check_gpu
    
    # 拉取镜像
    pull_images
    
    # 启动服务
    start_services
    
    # 等待服务就绪
    wait_for_services
    
    # 下载模型
    download_models
    
    # 显示访问信息
    show_access_info
}

# 运行主函数
main
