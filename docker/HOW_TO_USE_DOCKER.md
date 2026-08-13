# Alata Studio Lite Docker 使用说明

本文档面向当前仓库，而不是上游 AnythingLLM 通用镜像说明。仓库内现有 4 套 Docker 入口，先选对入口，再配环境变量。

## 先选入口

| 文件 | 适用场景 | 默认包含内容 |
| --- | --- | --- |
| `docker/docker-compose.lite.yml` | 推荐。想用当前 Lite 仓库快速起完整服务 | Lite 镜像 + PostgreSQL + MinIO + IM Gateway + agency-agents 自动导入 |
| `docker/docker-compose.alata.yml` | 需要完整系统依赖（Chromium / FFmpeg 等） | Full 镜像 + PostgreSQL + MinIO + IM Gateway + agency-agents 自动导入 |
| `docker/docker-compose.yml` | 想保持 AnythingLLM 风格的单容器部署 | 单容器，挂载本地 `server/storage`，更接近上游 |
| `docker/docker-compose.ollama.yml` | 需要配合本机/旁路 Ollama | 单容器 + Ollama 相关环境变量 |

### 选型建议

- 日常本地验证、云端 API Key 完整部署：用 `docker/docker-compose.lite.yml`
- 需要 Chromium 抓取、FFmpeg 或更完整系统依赖，同时仍保持完整部署：用 `docker/docker-compose.alata.yml`
- 只想做最小单容器 smoke test：直接 `docker build` + `docker run`，见文末

## 环境要求

- 已安装 Docker Engine 和 `docker compose` 插件
- 建议至少预留 10GB 磁盘空间给镜像、卷和运行时数据
- 若容器内需要访问宿主机服务，请把宿主机地址写成 `http://host.docker.internal:<port>`

检查命令：

```bash
docker version
docker compose version
```

## 环境变量模板

### Lite / Alata 多服务编排

推荐以 `docker/.env.alata.example` 为起点：

```bash
cp docker/.env.alata.example docker/.env
```

最少需要改这些项：

- `JWT_SECRET`
- `AUTH_TOKEN`
- `INTERNAL_API_SECRET`
- 一组可用的 LLM 配置，例如 `LLM_PROVIDER=deepseek` + `DEEPSEEK_API_KEY=...`
- 一组可用的 embedding 配置
- `ALATA_GATEWAY_API_KEY`

### 关于 Lite 模式的 embedding

`docker/docker-compose.lite.yml` 会强制：

```env
LIGHTWEIGHT_MODE=true
WEB_SCRAPER=jina
```

因此 Lite 模式下不要继续使用 `EMBEDDING_ENGINE=native`。推荐改成云端 embedding，例如：

```env
EMBEDDING_ENGINE=jina
EMBEDDING_MODEL_PREF=jina-embeddings-v2-base-en
JINA_API_KEY=your-jina-api-key
```

如果你确实要用 `native` / Ollama / LM Studio，请改用 `docker/docker-compose.alata.yml`，或者显式关闭 Lite 模式后自行承担镜像体积与依赖成本。

### 上游兼容单容器编排

如果你使用 `docker/docker-compose.yml`，请改用：

```bash
cp docker/.env.example docker/.env
```

这个模板更接近 AnythingLLM 原始单容器部署方式。

## 推荐启动：Lite Compose

```bash
cp docker/.env.alata.example docker/.env

# 编辑 docker/.env，至少填入：
# JWT_SECRET=...
# AUTH_TOKEN=...
# LLM_PROVIDER=...
# 对应的 API Key
# EMBEDDING_ENGINE=...

docker compose -f docker/docker-compose.lite.yml up -d --build
docker compose -f docker/docker-compose.lite.yml ps
curl http://localhost:3001/api/ping
```

启动后可访问：

- Alata Studio: `http://localhost:3001`
- IM Gateway: `http://localhost:3100/health`
- MinIO Console: `http://localhost:9001`
- PostgreSQL: `localhost:5432`

默认启动链路还会自动完成：

- 初始化系统设置和内置员工
- 导入仓库内置的 `agency-agents` 模板到数据库
- 创建 `docker-im-gateway` 专用 API Key，让 sidecar gateway 开箱即连主服务

停止并清理：

```bash
docker compose -f docker/docker-compose.lite.yml down
```

如果连卷也一起删除：

```bash
docker compose -f docker/docker-compose.lite.yml down -v
```

## 完整镜像启动：Alata Compose

当你需要 Chromium / FFmpeg / 更完整系统依赖时：

```bash
cp docker/.env.alata.example docker/.env
docker compose -f docker/docker-compose.alata.yml up -d --build
```

### Prisma schema 选择规则

容器入口脚本会自动判断数据库类型：

- `DATABASE_URL=postgresql://...` 时使用 `server/prisma/postgres/schema.prisma`
- 未设置 `DATABASE_URL` 或使用本地文件时使用 SQLite schema

也就是说，`docker-compose.lite.yml` / `docker-compose.alata.yml` 里的 PostgreSQL 配置是可直接启动的，不需要你手动改 Dockerfile；两者都会默认起完整项目，而不是半成品空库。

## 单容器 smoke test

如果你只是想验证“镜像能不能 build、容器能不能起来”，可以走最小单容器路径。这个路径不依赖 PostgreSQL / MinIO，直接用 SQLite 存储。

1. 准备一个最小 env 文件，例如 `./.tmp/alata-smoke.env`
2. 填入至少这些变量：

```env
NODE_ENV=production
SERVER_PORT=3001
STORAGE_DIR=/app/server/storage
JWT_SECRET=replace-with-a-random-string
AUTH_TOKEN=replace-with-a-password
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=replace-with-a-real-or-placeholder-value
DEEPSEEK_MODEL_PREF=deepseek-chat
EMBEDDING_ENGINE=jina
EMBEDDING_MODEL_PREF=jina-embeddings-v2-base-en
JINA_API_KEY=replace-with-a-real-or-placeholder-value
```

3. 构建并运行：

```bash
mkdir -p .tmp/alata-storage .tmp/alata-hotdir .tmp/alata-outputs

docker build \
  -f docker/Dockerfile.lite \
  -t alata-studio-lite:local \
  --build-arg ARG_UID="$(id -u)" \
  --build-arg ARG_GID="$(id -g)" \
  .

docker run -d \
  --name alata-studio-lite-smoke \
  -p 3001:3001 \
  --add-host=host.docker.internal:host-gateway \
  --env-file ./.tmp/alata-smoke.env \
  -v "$(pwd)/.tmp/alata-storage:/app/server/storage" \
  -v "$(pwd)/.tmp/alata-hotdir:/app/collector/hotdir" \
  -v "$(pwd)/.tmp/alata-outputs:/app/collector/outputs" \
  alata-studio-lite:local

curl http://localhost:3001/api/ping
docker logs --tail=200 alata-studio-lite-smoke
```

清理：

```bash
docker rm -f alata-studio-lite-smoke
```

## 常见问题

### 1. `JWT_SECRET` 或 `AUTH_TOKEN` 没配

服务能启动，但大部分受保护接口会直接报鉴权错误。单用户模式至少要配：

```env
JWT_SECRET=...
AUTH_TOKEN=...
```

### 2. Lite 模式里 `EMBEDDING_ENGINE=native`

这是最常见的错误组合。Lite 模式默认禁用本地 embedding / 本地 provider。请改成 `jina`、`openai`、`azure`、`cohere`、`gemini` 等云端 embedding，或者改用 full 镜像。

### 3. 容器里访问不到宿主机上的 Ollama / Chroma / LM Studio

把地址从：

- `http://localhost:11434`

改成：

- `http://host.docker.internal:11434`

Linux 如果无法解析该域名，需要额外加：

```bash
--add-host=host.docker.internal:host-gateway
```

### 4. 首次 build 很慢

这是正常现象。Dockerfile 会在容器内完成 frontend build、server/collector 依赖安装和 Prisma client 生成。后续只要缓存命中，速度会明显好一些。

### 5. 单容器 smoke test 时不要把 `.env` 只读挂到 `/app/server/.env`

应用首次启动时可能会回写 `SIG_KEY` / `SIG_SALT` 等运行时配置。`docker run` 场景下推荐只使用 `--env-file` 注入环境变量，不要再额外挂只读 `.env` 文件。
