# 故障排查指南

本文档提供 Alata Studio 本地 LLM 部署的常见问题和解决方案。

---

## 🔌 连接问题

### 问题 1: 无法连接到 Ollama

**症状**：
- Alata Studio 显示 "LLM is offline"
- 错误信息：`connect ECONNREFUSED 127.0.0.1:11434`

**诊断步骤**：

1. **检查 Ollama 是否运行**
   ```bash
   # 测试 Ollama API
   curl http://localhost:11434/api/tags
   
   # 应该返回已安装的模型列表
   ```

2. **检查 Ollama 进程**
   ```bash
   # Linux/macOS
   ps aux | grep ollama
   
   # Windows
   tasklist | findstr ollama
   ```

**解决方案**：

```bash
# 启动 Ollama
ollama serve

# 或使用系统服务（Linux）
sudo systemctl start ollama

# macOS
brew services start ollama
```

---

### 问题 2: Docker 容器内无法访问宿主机 Ollama

**症状**：
- Docker Compose 启动成功
- Alata Studio 无法连接到 Ollama
- 错误信息：`connect ECONNREFUSED 127.0.0.1:11434`

**原因**：
Docker 容器内的 `localhost` 指向容器本身，而非宿主机

**解决方案**：

**方式 1: 使用 `host.docker.internal`（推荐）**
```bash
# 修改环境变量
OLLAMA_BASE_PATH=http://host.docker.internal:11434
```

**方式 2: 使用宿主机 IP**
```bash
# 获取宿主机 IP
ip addr show docker0 | grep inet

# 修改环境变量
OLLAMA_BASE_PATH=http://172.17.0.1:11434
```

**方式 3: 使用 Docker Compose 网络（推荐）**
```yaml
# docker-compose.ollama.yml
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
  
  alata-studio:
    image: mintplexlabs/anythingllm:latest
    environment:
      - OLLAMA_BASE_PATH=http://ollama:11434  # 使用服务名
```

---

### 问题 3: K8s Pod 无法访问 Ollama

**症状**：
- Pod 状态正常
- 无法连接到 Ollama Service

**诊断步骤**：

```bash
# 1. 检查 Service 是否存在
kubectl get svc -n alata-studio

# 2. 检查 Endpoints
kubectl get endpoints ollama-service -n alata-studio

# 3. 测试连接
kubectl exec -it <alata-pod> -n alata-studio -- \
  curl http://ollama-service:11434/api/tags
```

**解决方案**：

```yaml
# 确保 Service 配置正确
apiVersion: v1
kind: Service
metadata:
  name: ollama-service
spec:
  selector:
    app: ollama
  ports:
    - port: 11434
      targetPort: 11434
```

---

## 🐌 性能问题

### 问题 4: 响应速度慢

**症状**：
- 每次回复需要 30 秒以上
- CPU/GPU 使用率低

**诊断步骤**：

1. **检查是否使用 GPU**
   ```bash
   # 查看 GPU 使用情况
   nvidia-smi
   
   # 查看 Ollama 进程
   ollama ps
   ```

2. **检查模型大小**
   ```bash
   # 查看已加载的模型
   ollama list
   ```

**解决方案**：

**方案 1: 启用 GPU 加速**
```bash
# 确保 NVIDIA 驱动已安装
nvidia-smi

# Docker 启动时添加 GPU 支持
docker run --gpus all ollama/ollama:latest
```

**方案 2: 使用更小的模型**
```bash
# 从 qwen2.5:14b 切换到 qwen2.5:7b
ollama pull qwen2.5:7b

# 或使用 3b 模型
ollama pull qwen2.5:3b
```

**方案 3: 调整并发配置**
```bash
# 减少并发请求数
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
```

---

### 问题 5: 内存占用过高

**症状**：
- 系统内存不足
- OOM (Out of Memory) 错误
- 系统卡顿

**诊断步骤**：

```bash
# 查看内存使用
free -h

# 查看 Ollama 内存占用
ps aux | grep ollama | awk '{print $6}'
```

**解决方案**：

**方案 1: 使用更小的模型**
```bash
# 3B 模型（约 2GB 内存）
ollama pull qwen2.5:3b

# 7B 模型（约 5GB 内存）
ollama pull qwen2.5:7b
```

**方案 2: 限制内存使用**
```bash
# 设置最大 VRAM
export OLLAMA_MAX_VRAM=4  # 4GB

# 减少上下文长度
export OLLAMA_NUM_CTX=2048  # 从 4096 减少到 2048
```

**方案 3: 启用 Swap**
```bash
# Linux 创建 Swap
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

### 问题 6: GPU 未被使用

**症状**：
- 安装了 NVIDIA GPU
- `nvidia-smi` 显示 GPU 空闲
- Ollama 仍使用 CPU

**诊断步骤**：

```bash
# 1. 检查 CUDA 是否安装
nvcc --version

# 2. 检查 Ollama 是否检测到 GPU
ollama ps
```

**解决方案**：

**方案 1: 安装 NVIDIA Container Toolkit（Docker）**
```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

**方案 2: 重新安装 Ollama**
```bash
# 卸载
sudo rm /usr/local/bin/ollama
sudo rm -rf /usr/share/ollama

# 重新安装
curl -fsSL https://ollama.com/install.sh | sh
```

**方案 3: 手动指定 GPU**
```bash
export CUDA_VISIBLE_DEVICES=0
export OLLAMA_GPU_LAYERS=35
ollama serve
```

---

## 📦 模型问题

### 问题 7: 模型加载失败

**症状**：
- 错误信息：`failed to load model`
- 模型下载中断

**解决方案**：

```bash
# 1. 删除损坏的模型
ollama rm qwen2.5:7b

# 2. 清理缓存
rm -rf ~/.ollama/models/*

# 3. 重新下载
ollama pull qwen2.5:7b
```

---

### 问题 8: 模型输出质量差

**症状**：
- 回答不准确
- 输出格式混乱
- 中文支持差

**解决方案**：

**方案 1: 使用更大的模型**
```bash
# 从 3b 升级到 7b
ollama pull qwen2.5:7b

# 或升级到 14b
ollama pull qwen2.5:14b
```

**方案 2: 调整温度参数**
```bash
# 在 Alata Studio 设置中调整
# Temperature: 0.7（默认）
# 降低温度（0.3-0.5）可以提高准确性
# 提高温度（0.8-1.0）可以增加创造性
```

**方案 3: 使用专用模型**
```bash
# 代码场景使用 DeepSeek
ollama pull deepseek-coder:6.7b

# 中文场景使用 Qwen
ollama pull qwen2.5:7b
```

---

### 问题 9: 模型不支持中文

**症状**：
- 中文输入乱码
- 中文输出质量差

**解决方案**：

```bash
# 使用中文优化的模型
ollama pull qwen2.5:7b  # 推荐
ollama pull qwen2.5:14b  # 高质量

# Embedding 使用中文模型
ollama pull bge-large-zh-v1.5
```

---

## 🐳 部署问题

### 问题 10: Docker Compose 启动失败

**症状**：
- `docker-compose up` 报错
- 容器无法启动

**诊断步骤**：

```bash
# 查看日志
docker-compose -f docker-compose.ollama.yml logs

# 查看容器状态
docker-compose -f docker-compose.ollama.yml ps
```

**常见错误**：

**错误 1: 端口被占用**
```bash
# 错误信息：bind: address already in use

# 解决方案：修改端口
ports:
  - "3002:3001"  # 改用 3002
```

**错误 2: 权限问题**
```bash
# 错误信息：permission denied

# 解决方案：修改权限
sudo chown -R $USER:$USER ./storage
```

---

### 问题 11: K8s Pod 无法启动

**症状**：
- Pod 状态为 `CrashLoopBackOff`
- Pod 状态为 `ImagePullBackOff`

**诊断步骤**：

```bash
# 查看 Pod 状态
kubectl get pods -n alata-studio

# 查看 Pod 日志
kubectl logs <pod-name> -n alata-studio

# 查看 Pod 事件
kubectl describe pod <pod-name> -n alata-studio
```

**解决方案**：

```bash
# 1. 检查镜像是否存在
kubectl describe pod <pod-name> -n alata-studio | grep Image

# 2. 检查资源限制
kubectl describe pod <pod-name> -n alata-studio | grep -A 5 Resources

# 3. 检查 PVC 是否绑定
kubectl get pvc -n alata-studio
```

---

### 问题 12: 持久化存储丢失

**症状**：
- 重启后数据丢失
- 模型需要重新下载

**解决方案**：

**Docker Compose**：
```yaml
volumes:
  ollama_data:
    driver: local
  alata_storage:
    driver: local
```

**Kubernetes**：
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: alata-storage-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
```

---

## 🆘 获取帮助

如果以上方案都无法解决您的问题，请通过以下方式获取帮助：

### 1. 查看日志

```bash
# Ollama 日志
journalctl -u ollama -f

# Docker 日志
docker logs alata-studio
docker logs ollama

# K8s 日志
kubectl logs <pod-name> -n alata-studio
```

### 2. 提交 Issue

访问：https://github.com/your-org/alata-studio/issues

请包含以下信息：
- 操作系统和版本
- Ollama 版本（`ollama --version`）
- 错误信息和日志
- 复现步骤

### 3. 社区支持

- **Discord**: https://discord.gg/alata-studio
- **文档**: https://docs.alata-studio.com
- **论坛**: https://forum.alata-studio.com

---

## 📚 相关文档

- [本地 LLM 部署指南](./LOCAL_LLM_DEPLOYMENT.md)
- [Ollama 详细配置](./OLLAMA_SETUP.md)
- [K8s 部署指南](../../k8s/README.md)

---

**最后更新**: 2025-01-16

