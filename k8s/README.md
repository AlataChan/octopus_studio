# Kubernetes 部署指南

本指南介绍如何在 Kubernetes 集群中部署 Alata Studio + Ollama。

---

## 📋 前置要求

### 集群要求
- Kubernetes 1.20+
- kubectl 已配置并可访问集群
- 集群有足够的资源：
  - CPU: 4 核+
  - 内存: 16GB+
  - 存储: 100GB+

### 可选要求
- NVIDIA GPU（用于 GPU 加速）
- NVIDIA GPU Operator（GPU 支持）
- Ingress Controller（外部访问）
- StorageClass（动态存储分配）

---

## 🚀 快速开始

### 1. 创建命名空间

```bash
kubectl create namespace alata-studio
```

### 2. 应用所有配置

```bash
# 进入 k8s/examples 目录
cd k8s/examples

# 应用所有配置
kubectl apply -f pvc.yaml
kubectl apply -f configmap.yaml
kubectl apply -f ollama-deployment.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

### 3. 等待 Pod 就绪

```bash
# 查看 Pod 状态
kubectl get pods -n alata-studio -w

# 等待所有 Pod 变为 Running
# NAME                            READY   STATUS    RESTARTS   AGE
# ollama-xxx                      1/1     Running   0          2m
# alata-studio-xxx                1/1     Running   0          1m
```

### 4. 下载模型

```bash
# 获取 Ollama Pod 名称
OLLAMA_POD=$(kubectl get pods -n alata-studio -l app=ollama -o jsonpath='{.items[0].metadata.name}')

# 下载 LLM 模型
kubectl exec -it $OLLAMA_POD -n alata-studio -- ollama pull qwen2.5:7b

# 下载 Embedding 模型
kubectl exec -it $OLLAMA_POD -n alata-studio -- ollama pull nomic-embed-text:latest

# 查看已下载的模型
kubectl exec -it $OLLAMA_POD -n alata-studio -- ollama list
```

### 5. 访问服务

```bash
# 方式 1: 端口转发（本地访问）
kubectl port-forward svc/alata-studio-service 3001:3001 -n alata-studio

# 访问: http://localhost:3001
```

---

## 📁 配置文件说明

### pvc.yaml
持久化存储卷声明，包括：
- `alata-storage-pvc`: 主存储（20Gi）
- `alata-hotdir-pvc`: 文档上传（10Gi）
- `alata-outputs-pvc`: 输出文件（5Gi）
- `ollama-data-pvc`: 模型存储（50Gi）

### configmap.yaml
配置参数，包括：
- LLM 配置（Ollama 地址、模型名称）
- Embedding 配置
- 性能参数

### ollama-deployment.yaml
Ollama 服务部署，包括：
- Ollama 容器配置
- 资源限制
- 健康检查
- GPU 支持（可选）

### deployment.yaml
Alata Studio 主应用部署，包括：
- 应用容器配置
- 环境变量
- 存储卷挂载
- 健康检查

### service.yaml
服务暴露，包括：
- ClusterIP Service（集群内部访问）
- NodePort Service（可选，外部访问）
- LoadBalancer Service（可选，云环境）

---

## 🔧 常用操作

### 查看日志

```bash
# 查看 Alata Studio 日志
kubectl logs -f deployment/alata-studio -n alata-studio

# 查看 Ollama 日志
kubectl logs -f deployment/ollama -n alata-studio

# 查看最近 100 行日志
kubectl logs --tail=100 deployment/alata-studio -n alata-studio
```

### 扩容/缩容

```bash
# 扩容到 3 个副本
kubectl scale deployment alata-studio --replicas=3 -n alata-studio

# 缩容到 1 个副本
kubectl scale deployment alata-studio --replicas=1 -n alata-studio
```

### 更新镜像

```bash
# 更新到指定版本
kubectl set image deployment/alata-studio \
  alata-studio=mintplexlabs/anythingllm:v1.2.0 \
  -n alata-studio

# 查看滚动更新状态
kubectl rollout status deployment/alata-studio -n alata-studio

# 回滚到上一个版本
kubectl rollout undo deployment/alata-studio -n alata-studio
```

### 重启服务

```bash
# 重启 Alata Studio
kubectl rollout restart deployment/alata-studio -n alata-studio

# 重启 Ollama
kubectl rollout restart deployment/ollama -n alata-studio
```

### 调试

```bash
# 进入 Pod 内部
kubectl exec -it <pod-name> -n alata-studio -- /bin/bash

# 查看 Pod 详情
kubectl describe pod <pod-name> -n alata-studio

# 查看 Pod 事件
kubectl get events -n alata-studio --sort-by='.lastTimestamp'
```

---

## 🌐 外部访问

### 方式 1: NodePort（开发/测试）

```bash
# 应用 NodePort Service
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: alata-studio-nodeport
  namespace: alata-studio
spec:
  type: NodePort
  selector:
    app: alata-studio
  ports:
  - port: 3001
    targetPort: 3001
    nodePort: 30001
EOF

# 访问: http://<node-ip>:30001
```

### 方式 2: LoadBalancer（云环境）

```bash
# 应用 LoadBalancer Service
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: alata-studio-lb
  namespace: alata-studio
spec:
  type: LoadBalancer
  selector:
    app: alata-studio
  ports:
  - port: 80
    targetPort: 3001
EOF

# 获取外部 IP
kubectl get svc alata-studio-lb -n alata-studio
```

### 方式 3: Ingress（推荐）

```bash
# 应用 Ingress
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: alata-studio-ingress
  namespace: alata-studio
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: alata.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: alata-studio-service
            port:
              number: 3001
EOF

# 访问: http://alata.example.com
```

---

## 🎮 GPU 支持

### 1. 安装 NVIDIA GPU Operator

```bash
# 添加 Helm 仓库
helm repo add nvidia https://nvidia.github.io/gpu-operator
helm repo update

# 安装 GPU Operator
helm install gpu-operator nvidia/gpu-operator \
  --namespace gpu-operator-resources \
  --create-namespace
```

### 2. 验证 GPU 可用性

```bash
# 查看 GPU 资源
kubectl get nodes -o json | jq '.items[].status.capacity'

# 应该看到类似输出：
# "nvidia.com/gpu": "1"
```

### 3. 启用 GPU 支持

编辑 `ollama-deployment.yaml`，取消注释以下部分：

```yaml
resources:
  limits:
    nvidia.com/gpu: 1

nodeSelector:
  nvidia.com/gpu: "true"
```

### 4. 重新部署

```bash
kubectl apply -f ollama-deployment.yaml
```

---

## 🔍 故障排查

### Pod 无法启动

```bash
# 查看 Pod 状态
kubectl get pods -n alata-studio

# 查看 Pod 详情
kubectl describe pod <pod-name> -n alata-studio

# 常见问题：
# - ImagePullBackOff: 镜像拉取失败
# - CrashLoopBackOff: 容器启动失败
# - Pending: 资源不足或 PVC 未绑定
```

### PVC 未绑定

```bash
# 查看 PVC 状态
kubectl get pvc -n alata-studio

# 查看 PVC 详情
kubectl describe pvc alata-storage-pvc -n alata-studio

# 解决方案：
# 1. 检查是否有可用的 StorageClass
kubectl get storageclass

# 2. 手动创建 PV（如果没有动态分配）
# 3. 调整 PVC 大小
```

### 服务无法访问

```bash
# 测试服务连接
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n alata-studio -- \
  curl http://alata-studio-service:3001/api/ping

# 检查 Service 和 Endpoints
kubectl get svc -n alata-studio
kubectl get endpoints -n alata-studio
```

---

## 📚 相关文档

- [本地 LLM 部署指南](../docs/zh-CN/LOCAL_LLM_DEPLOYMENT.md)
- [Ollama 详细配置](../docs/zh-CN/OLLAMA_SETUP.md)
- [故障排查指南](../docs/zh-CN/TROUBLESHOOTING.md)
- [Docker Compose 部署](../docker/docker-compose.ollama.yml)

---

## 🆘 获取帮助

- **GitHub Issues**: https://github.com/your-org/alata-studio/issues
- **文档**: https://docs.alata-studio.com
- **社区**: https://discord.gg/alata-studio

---

**最后更新**: 2025-01-16

