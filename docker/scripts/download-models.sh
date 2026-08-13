#!/bin/bash

# Ollama 模型下载脚本
# 用途：下载推荐的 LLM 和 Embedding 模型

set -e  # 遇到错误立即退出

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

# 检查 Ollama 容器是否运行
check_ollama() {
    if ! docker ps | grep -q alata-ollama; then
        print_error "Ollama 容器未运行"
        print_info "请先运行: bash docker/scripts/start-with-ollama.sh"
        exit 1
    fi
    print_success "Ollama 容器正在运行"
}

# 下载模型
download_model() {
    local model_name=$1
    local model_desc=$2
    local model_size=$3
    
    print_info "下载 ${model_desc} (${model_name})..."
    print_warning "预计大小: ${model_size}"
    
    if docker exec alata-ollama ollama pull "$model_name"; then
        print_success "${model_desc} 下载完成"
        return 0
    else
        print_error "${model_desc} 下载失败"
        return 1
    fi
}

# 显示模型选择菜单
show_model_menu() {
    print_header "选择要下载的模型"
    
    echo "LLM 模型（对话生成）："
    echo "  1) qwen2.5:3b      - 轻量级模型 (2.0 GB) - 适合低配置环境"
    echo "  2) qwen2.5:7b      - 通用模型 (4.7 GB) - 推荐 ⭐⭐⭐⭐⭐"
    echo "  3) qwen2.5:14b     - 高质量模型 (9.0 GB) - 适合高配置环境"
    echo "  4) deepseek-coder:6.7b - 代码专用 (3.8 GB) - 代码场景推荐 ⭐⭐⭐⭐⭐"
    echo ""
    echo "Embedding 模型（向量化）："
    echo "  5) nomic-embed-text - 通用 Embedding (274 MB) - 推荐 ⭐⭐⭐⭐⭐"
    echo "  6) bge-large-zh-v1.5 - 中文优化 (1.3 GB) - 中文场景推荐"
    echo ""
    echo "快捷选项："
    echo "  A) 全部下载（推荐配置：qwen2.5:7b + nomic-embed-text）"
    echo "  B) 轻量配置（qwen2.5:3b + nomic-embed-text）"
    echo "  C) 代码配置（deepseek-coder:6.7b + nomic-embed-text）"
    echo "  Q) 退出"
    echo ""
}

# 下载推荐配置
download_recommended() {
    print_header "下载推荐配置"
    
    download_model "qwen2.5:7b" "Qwen2.5 7B（通用 LLM）" "4.7 GB"
    download_model "nomic-embed-text:latest" "Nomic Embed Text（Embedding）" "274 MB"
    
    print_success "推荐配置下载完成"
}

# 下载轻量配置
download_lightweight() {
    print_header "下载轻量配置"
    
    download_model "qwen2.5:3b" "Qwen2.5 3B（轻量 LLM）" "2.0 GB"
    download_model "nomic-embed-text:latest" "Nomic Embed Text（Embedding）" "274 MB"
    
    print_success "轻量配置下载完成"
}

# 下载代码配置
download_code() {
    print_header "下载代码配置"
    
    download_model "deepseek-coder:6.7b" "DeepSeek Coder 6.7B（代码 LLM）" "3.8 GB"
    download_model "nomic-embed-text:latest" "Nomic Embed Text（Embedding）" "274 MB"
    
    print_success "代码配置下载完成"
}

# 列出已下载的模型
list_models() {
    print_header "已下载的模型"
    
    docker exec alata-ollama ollama list
}

# 主函数
main() {
    print_header "Ollama 模型下载工具"
    
    # 检查 Ollama 容器
    check_ollama
    
    # 显示已下载的模型
    list_models
    
    # 显示菜单
    while true; do
        show_model_menu
        read -p "请选择 (1-6/A/B/C/Q): " choice
        
        case $choice in
            1)
                download_model "qwen2.5:3b" "Qwen2.5 3B" "2.0 GB"
                ;;
            2)
                download_model "qwen2.5:7b" "Qwen2.5 7B" "4.7 GB"
                ;;
            3)
                download_model "qwen2.5:14b" "Qwen2.5 14B" "9.0 GB"
                ;;
            4)
                download_model "deepseek-coder:6.7b" "DeepSeek Coder 6.7B" "3.8 GB"
                ;;
            5)
                download_model "nomic-embed-text:latest" "Nomic Embed Text" "274 MB"
                ;;
            6)
                download_model "bge-large-zh-v1.5" "BGE Large ZH v1.5" "1.3 GB"
                ;;
            [Aa])
                download_recommended
                break
                ;;
            [Bb])
                download_lightweight
                break
                ;;
            [Cc])
                download_code
                break
                ;;
            [Qq])
                print_info "退出"
                exit 0
                ;;
            *)
                print_error "无效选择，请重新输入"
                ;;
        esac
        
        echo ""
        read -p "是否继续下载其他模型？(y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            break
        fi
    done
    
    # 显示最终结果
    list_models
    
    print_header "下载完成"
    print_success "模型已准备就绪，可以开始使用 Alata Studio"
    print_info "访问地址: http://localhost:3001"
}

# 运行主函数
main

