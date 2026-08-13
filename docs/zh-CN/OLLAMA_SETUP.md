# Ollama 详细配置指南

## 📖 什么是 Ollama？

Ollama 是一个开源的本地 LLM 运行工具，支持 Llama、Qwen、DeepSeek 等多种模型。

**官方网站**：https://ollama.com

**特点**：
- ✅ 安装简单，一键启动
- ✅ 支持多种模型
- ✅ 自动 GPU 加速
- ✅ OpenAI 兼容 API
- ✅ 模型管理方便

---

## 🚀 安装 Ollama

### Linux

```bash
# 方式 1: 官方安装脚本（推荐）
curl -fsSL https://ollama.com/install.sh | sh

# 方式 2: 手动安装
# 下载二进制文件
curl -L https://ollama.com/download/ollama-linux-amd64 -o ollama
chmod +x ollama
sudo mv ollama /usr/local/bin/

# 启动服务
ollama serve
```

**系统服务配置**：
```bash
# 创建 systemd 服务
sudo tee /etc/systemd/system/ollama.service > /dev/null <<EOF
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3
Environment="OLLAMA_HOST=0.0.0.0:11434"

[Install]
WantedBy=default.target
EOF

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama
```

---

### macOS

```bash
# 方式 1: 官方安装脚本（推荐）
curl -fsSL https://ollama.com/install.sh | sh

# 方式 2: Homebrew
brew install ollama

# 启动服务
ollama serve
```

**后台运行**：
```bash
# 使用 launchd
brew services start ollama
```

---

### Windows

1. **下载安装包**
   - 访问：https://ollama.com/download/windows
   - 下载 `OllamaSetup.exe`
   - 双击安装

2. **启动 Ollama**
   - 安装完成后自动启动
   - 系统托盘会显示 Ollama 图标

3. **命令行使用**
   ```powershell
   # 打开 PowerShell 或 CMD
   ollama --version
   ```

---

### Docker

```bash
# 拉取镜像
docker pull ollama/ollama:latest

# 启动容器（CPU）
docker run -d \
  --name ollama \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  ollama/ollama:latest

# 启动容器（GPU）
docker run -d \
  --name ollama \
  --gpus all \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  ollama/ollama:latest
```

---

## 📦 模型管理

### 下载模型

```bash
# 基本语法
ollama pull <model_name>

# 示例
ollama pull qwen2.5:7b
ollama pull deepseek-coder:6.7b
ollama pull nomic-embed-text:latest
```

### 查看已安装模型

```bash
# 列出所有模型
ollama list

# 输出示例
NAME                    ID              SIZE    MODIFIED
qwen2.5:7b             a1b2c3d4e5f6    4.7 GB  2 hours ago
nomic-embed-text       f6e5d4c3b2a1    274 MB  2 hours ago
```

### 删除模型

```bash
# 删除指定模型
ollama rm qwen2.5:7b

# 删除所有未使用的模型
ollama prune
```

### 运行模型（测试）

```bash
# 交互式运行
ollama run qwen2.5:7b

# 输入问题测试
>>> 你好，请介绍一下自己
>>> /bye  # 退出
```

---

## 🎯 推荐模型

### LLM 模型（对话生成）

| 模型 | 参数量 | 大小 | 适用场景 | 推荐指数 |
|------|--------|------|---------|---------|
| **qwen2.5:3b** | 3B | 2.0 GB | 低配置环境 | ⭐⭐⭐ |
| **qwen2.5:7b** | 7B | 4.7 GB | 通用场景 | ⭐⭐⭐⭐⭐ |
| **qwen2.5:14b** | 14B | 9.0 GB | 高质量输出 | ⭐⭐⭐⭐ |
| **deepseek-coder:6.7b** | 6.7B | 3.8 GB | 代码生成 | ⭐⭐⭐⭐⭐ |
| **llama3.1:8b** | 8B | 4.7 GB | 英文场景 | ⭐⭐⭐⭐ |

**下载命令**：
```bash
# 通用场景（推荐）
ollama pull qwen2.5:7b

# 代码场景（推荐）
ollama pull deepseek-coder:6.7b

# 低配置环境
ollama pull qwen2.5:3b

# 高质量输出
ollama pull qwen2.5:14b
```

---

### Embedding 模型（向量化）

| 模型 | 大小 | 维度 | 适用场景 | 推荐指数 |
|------|------|------|---------|---------|
| **nomic-embed-text** | 274 MB | 768 | 通用英文 | ⭐⭐⭐⭐⭐ |
| **bge-large-zh-v1.5** | 1.3 GB | 1024 | 中文优化 | ⭐⭐⭐⭐ |
| **mxbai-embed-large** | 669 MB | 1024 | 高质量 | ⭐⭐⭐⭐ |

**下载命令**：
```bash
# 通用场景（推荐）
ollama pull nomic-embed-text:latest

# 中文优化
ollama pull bge-large-zh-v1.5
```

---

## ⚙️ 性能配置

### GPU 加速

**检查 GPU 是否可用**：
```bash
# NVIDIA GPU
nvidia-smi

# 查看 Ollama 是否使用 GPU
ollama ps
```

**强制使用 GPU**：
```bash
# 设置环境变量
export CUDA_VISIBLE_DEVICES=0  # 使用第一块 GPU
export OLLAMA_GPU_LAYERS=35    # GPU 层数（根据显存调整）
```

---

### 内存限制

```bash
# 设置最大内存使用（GB）
export OLLAMA_MAX_VRAM=8

# 设置模型上下文长度
export OLLAMA_NUM_CTX=4096
```

---

### 并发请求

```bash
# 设置并发请求数
export OLLAMA_NUM_PARALLEL=2

# 设置同时加载的模型数
export OLLAMA_MAX_LOADED_MODELS=1
```

---

### Keep Alive 设置

```bash
# 设置模型保持加载的时间（秒）
export OLLAMA_KEEP_ALIVE=300  # 5 分钟

# 永久保持加载
export OLLAMA_KEEP_ALIVE=-1

# 立即卸载
export OLLAMA_KEEP_ALIVE=0
```

---

## 🔗 与 Alata Studio 集成

### Docker Compose 集成

**文件**：`docker/docker-compose.ollama.yml`

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

  alata-studio:
    image: mintplexlabs/anythingllm:latest
    depends_on:
      - ollama
    environment:
      - LLM_PROVIDER=ollama
      - OLLAMA_BASE_PATH=http://ollama:11434
      - OLLAMA_MODEL_PREF=qwen2.5:7b
      - EMBEDDING_ENGINE=ollama
      - EMBEDDING_BASE_PATH=http://ollama:11434
      - EMBEDDING_MODEL_PREF=nomic-embed-text:latest
```

**启动**：
```bash
docker-compose -f docker-compose.ollama.yml up -d
```

---

### 本地开发环境集成

**环境变量配置**（`server/.env`）：
```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_PATH=http://localhost:11434
OLLAMA_MODEL_PREF=qwen2.5:7b
OLLAMA_MODEL_TOKEN_LIMIT=8192

EMBEDDING_ENGINE=ollama
EMBEDDING_BASE_PATH=http://localhost:11434
EMBEDDING_MODEL_PREF=nomic-embed-text:latest
```

---

### Kubernetes 集成

**ConfigMap**：
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: alata-config
data:
  LLM_PROVIDER: "ollama"
  OLLAMA_BASE_PATH: "http://ollama-service:11434"
  OLLAMA_MODEL_PREF: "qwen2.5:7b"
```

详见：`k8s/README.md`

---

## 🔧 自定义模型

### 创建 Modelfile

```bash
# 创建 Modelfile
cat > Modelfile <<EOF
FROM qwen2.5:7b

# 设置温度
PARAMETER temperature 0.7

# 设置系统提示词
SYSTEM """
你是一个专业的 AI 助手，擅长回答技术问题。
请用简洁、准确的语言回答用户的问题。
"""
EOF

# 创建自定义模型
ollama create my-custom-model -f Modelfile

# 使用自定义模型
ollama run my-custom-model
```

---

## 📚 相关文档

- [本地 LLM 部署指南](./LOCAL_LLM_DEPLOYMENT.md)
- [故障排查指南](./TROUBLESHOOTING.md)
- [Ollama 官方文档](https://github.com/ollama/ollama/blob/main/docs/README.md)

---

**最后更新**: 2025-01-16

