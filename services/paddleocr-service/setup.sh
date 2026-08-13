#!/bin/bash
# PaddleOCR 服务安装脚本
# 用法: ./setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Setting up PaddleOCR 3.x Service..."
echo ""

# 检查 Python 版本
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python not found. Please install Python 3.8 or higher."
    exit 1
fi

PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | cut -d' ' -f2)
echo "📍 Using Python: $PYTHON_CMD ($PYTHON_VERSION)"

# 检查是否已有虚拟环境
if [ -d "venv" ]; then
    echo "📁 Virtual environment already exists"
    read -p "   Recreate? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf venv
        echo "   Removed old venv"
    fi
fi

# 创建虚拟环境
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    $PYTHON_CMD -m venv venv
fi

# 激活虚拟环境
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# 升级 pip
echo "📦 Upgrading pip..."
pip install --upgrade pip --quiet

# 安装依赖
echo "📦 Installing dependencies..."
echo "   This may take a few minutes..."
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "📌 Next steps:"
echo "   1. Start the service:  ./start.sh"
echo "   2. Download models:    curl -X POST http://127.0.0.1:8866/setup"
echo "   3. Test OCR:           See README.md for examples"
echo ""
echo "⚠️  Note: First OCR request will download ~400MB model files"

