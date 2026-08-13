# 本地 LLM 部署指南

## 📖 概述

Alata Studio 完全支持本地 LLM 部署，无需依赖公网 API，满足企业数据安全和合规需求。

### 为什么选择本地 LLM？

- ✅ **数据安全**：所有数据在本地处理，不会上传到云端
- ✅ **成本可控**：无需支付 API 调用费用
- ✅ **低延迟**：本地推理，响应更快
- ✅ **离线可用**：无需互联网连接
- ✅ **可定制**：可以使用自己微调的模型

---

## 🎯 支持的本地 LLM 方案

| 方案 | 适用场景 | 难度 | 推荐指数 |
|------|---------|------|---------|
| **Ollama** | 服务器部署 | ⭐ 简单 | ⭐⭐⭐⭐⭐ |
| **LM Studio** | 桌面用户 | ⭐ 简单 | ⭐⭐⭐⭐ |
| **LocalAI** | 高级用户 | ⭐⭐ 中等 | ⭐⭐⭐ |
| **KoboldCPP** | 轻量级部署 | ⭐⭐ 中等 | ⭐⭐⭐ |
| **TextGenWebUI** | 高级用户 | ⭐⭐⭐ 复杂 | ⭐⭐ |

---

## 🚀 推荐方案

### 方案 1: Ollama + Qwen2.5（通用场景）⭐⭐⭐⭐⭐

**适用场景**：通用对话、文档问答、知识检索

**推荐配置**：
- **LLM 模型**：Qwen2.5:7b（7B 参数，平衡性能与质量）
- **Embedding 模型**：nomic-embed-text:latest
- **最低硬件**：16GB RAM，无需 GPU
- **推荐硬件**：32GB RAM + NVIDIA GPU（8GB+ 显存）

**快速开始**：
```bash
# 1. 安装 Ollama（详见 OLLAMA_SETUP.md）
curl -fsSL https://ollama.com/install.sh | sh

# 2. 下载模型
ollama pull qwen2.5:7b
ollama pull nomic-embed-text:latest

# 3. 启动 Alata Studio（Docker Compose）
cd docker
docker-compose -f docker-compose.ollama.yml up -d
```

**访问地址**：http://localhost:3001

---

### 方案 2: Ollama + DeepSeek（代码场景）⭐⭐⭐⭐⭐

**适用场景**：代码生成、代码审查、技术文档

**推荐配置**：
- **LLM 模型**：deepseek-coder:6.7b（专注代码）
- **Embedding 模型**：nomic-embed-text:latest
- **最低硬件**：16GB RAM
- **推荐硬件**：32GB RAM + NVIDIA GPU

**快速开始**：
```bash
# 1. 下载 DeepSeek 模型
ollama pull deepseek-coder:6.7b

# 2. 修改 docker-compose.ollama.yml
# 将 OLLAMA_MODEL_PREF 改为 deepseek-coder:6.7b

# 3. 启动服务
docker-compose -f docker-compose.ollama.yml up -d
```

---

### 方案 3: LM Studio（桌面用户）⭐⭐⭐⭐

**适用场景**：个人开发者、桌面应用

**优势**：
- ✅ 图形化界面，易于使用
- ✅ 内置模型市场，一键下载
- ✅ 支持 Windows/macOS/Linux

**快速开始**：

1. **下载 LM Studio**
   - 访问：https://lmstudio.ai/
   - 下载对应平台的安装包

2. **下载模型**
   - 打开 LM Studio
   - 搜索 "Qwen2.5" 或 "DeepSeek"
   - 点击下载

3. **启动本地服务器**
   - 点击 "Local Server" 标签
   - 选择模型
   - 点击 "Start Server"
   - 默认地址：http://localhost:1234

4. **配置 Alata Studio**
   - 访问：http://localhost:3001/settings/llm-preference
   - 选择 "LM Studio"
   - Base Path：http://host.docker.internal:1234/v1
   - 保存设置

---

## 🐳 部署方式

### 方式 1: Docker Compose（推荐）

**优势**：一键启动，包含 Ollama + Alata Studio

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/alata-studio.git
cd alata-studio

# 2. 启动服务
cd docker
./scripts/start-with-ollama.sh

# 3. 等待模型下载（首次启动需要 5-10 分钟）
# 访问 http://localhost:3001
```

**配置文件**：`docker/docker-compose.ollama.yml`

---

### 方式 2: Kubernetes

**优势**：企业级部署，高可用

```bash
# 1. 创建命名空间
kubectl create namespace alata-studio

# 2. 部署 Alata Studio
kubectl apply -f k8s/examples/deployment.yaml
kubectl apply -f k8s/examples/service.yaml
kubectl apply -f k8s/examples/pvc.yaml

# 3. （可选）部署 Ollama
kubectl apply -f k8s/examples/ollama-deployment.yaml

# 4. 访问服务
kubectl port-forward svc/alata-studio 3001:3001 -n alata-studio
```

**详细文档**：`k8s/README.md`

---

### 方式 3: 本地开发环境

**优势**：适合开发调试

```bash
# 1. 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. 启动 Ollama
ollama serve

# 3. 下载模型
ollama pull qwen2.5:7b
ollama pull nomic-embed-text:latest

# 4. 启动 Alata Studio
cd server && npm run dev
cd frontend && npm run dev

# 5. 配置 LLM
# 访问 http://localhost:3000/settings/llm-preference
# 选择 Ollama，Base Path: http://localhost:11434
```

---

## ⚙️ 性能调优

### GPU 配置

**NVIDIA GPU**（推荐）：
```bash
# 1. 安装 NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker

# 2. 修改 docker-compose.ollama.yml
# 在 ollama 服务下添加：
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

### 内存优化

**调整 Ollama 并发配置**：
```bash
# 设置环境变量
export OLLAMA_NUM_PARALLEL=2  # 并发请求数
export OLLAMA_MAX_LOADED_MODELS=1  # 同时加载的模型数
```

### 并发配置

**Alata Studio 并发设置**：
```bash
# 在 .env 文件中添加
LOCAL_LLM_CONCURRENT_REQUESTS=2
LOCAL_LLM_MAX_TOKENS=4096
```

---

## 🔧 常见问题

详见：[故障排查指南](./TROUBLESHOOTING.md)

### 快速诊断

1. **无法连接到 Ollama**
   ```bash
   # 检查 Ollama 是否运行
   curl http://localhost:11434/api/tags
   ```

2. **响应速度慢**
   - 检查是否使用 GPU
   - 减小模型大小（如使用 qwen2.5:3b）
   - 降低并发请求数

3. **内存不足**
   - 使用更小的模型
   - 减少 `OLLAMA_NUM_PARALLEL`
   - 增加系统 swap

---

## 📚 相关文档

- [Ollama 详细配置](./OLLAMA_SETUP.md)
- [故障排查指南](./TROUBLESHOOTING.md)
- [K8s 部署指南](../../k8s/README.md)
- [Docker Compose 配置](../../docker/docker-compose.ollama.yml)

---

## 🆘 获取帮助

- **GitHub Issues**: https://github.com/your-org/alata-studio/issues
- **文档**: https://docs.alata-studio.com
- **社区**: https://discord.gg/alata-studio

---

**最后更新**: 2025-01-16

