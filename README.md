# Octopus Studio · 八爪鱼工作室

> **企业级多 Agent AI 工作台 & Agent Server**
> **Enterprise multi-agent AI workbench & agent server**
>
> 基于 Mintplex Labs 开源项目 **AnythingLLM (MIT)** 衍生，已在其之上构建出多 Agent 团队编排、自主工作执行、全链路可观测性、安全护栏与结构化输出等企业级能力。
> Derived from **AnythingLLM (MIT)** by Mintplex Labs, extended with multi-agent team orchestration, autonomous work execution, end-to-end observability, safety guardrails and structured output.

> 🌐 双语文档 · Bilingual：每个章节中文在前、English follows。
> 📐 Agent 能力的**权威说明**见 [`docs/AGENT_ARCHITECTURE.md`](docs/AGENT_ARCHITECTURE.md)。

> **2026-08-09 产品边界 / Product boundary:** Studio 是交付平台与状态权威；
> FDE 是需求、IR 与编译核心。跨境电商是当前主要验证市场。
> Studio 图执行器拥有工作流控制与耐久状态；Mastra 只在选中时作为 Agent/模型调用边界，
> 不持有工作流快照。可复验证据见 [`docs/evidence/`](docs/evidence/)。

---

## 项目简介 · Overview

**中文**

Octopus Studio 起步于 AnythingLLM 的「对话 + 知识库 + Agent」内核，如今已演进为一个**面向团队协作的企业级 AI 工作平台**。除了完整的 RAG / 多模型 / 工作区能力，它额外提供：

- **多 Agent 团队编排**（Preview）——用一个 LLM Planner 把目标拆解成步骤，派给多个「AI 员工」按步执行，带耐久化 HITL 审批与全链路追踪。
- **自主工作执行（work-agent）**——独立的「提交目标 → 自主执行 → 审批 → 产出 artifact」子系统，跑在 Mastra 引擎上，生产稳定。
- **全链路可观测性**——OpenTelemetry 四层 span，默认零开销，可导出到 Jaeger / Tempo / Langfuse。
- **安全护栏**——注入检测、PII 红化、审计 hook，已接入团队编排。
- **结构化输出**——schema 校验 + 自动修复，让 Agent 产出稳定可解析。

仓库聚焦「可运行的核心工程」：前端工作台、Node.js 服务端、文档采集/解析服务、IM Gateway、桌面端与部署脚本。为保持轻量，**不包含**依赖目录、构建产物与运行时数据（均可再生成）。

**English**

Octopus Studio began as AnythingLLM's "chat + knowledge base + agent" core and has grown into a **team-oriented enterprise AI platform**. On top of full RAG / multi-provider / workspace capabilities, it adds:

- **Multi-agent team orchestration** (Preview) — an LLM planner decomposes a goal into steps, dispatched to multiple "AI employees" with durable HITL approvals and full tracing.
- **Autonomous work execution (work-agent)** — a standalone "submit goal → execute → approve → artifact" subsystem on the Mastra engine, production-stable.
- **End-to-end observability** — 4-layer OpenTelemetry spans, zero overhead by default, exportable to Jaeger / Tempo / Langfuse.
- **Safety guardrails** — injection detection, PII redaction, audit hooks, wired into orchestration.
- **Structured output** — schema validation + auto-repair for reliably parseable agent output.

The repo focuses on the runnable core: frontend workbench, Node.js server, document collector, IM Gateway, desktop bundle and deployment scripts. It deliberately **excludes** dependency dirs, build artifacts and runtime data (all regenerable).

---

## 核心能力 · Key Capabilities

| 能力 / Capability                                 | 说明 / Description                                                                                        | 状态 / Status                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 对话 + 知识库（RAG） / Chat + RAG                 | 向量检索 + 知识图谱 + 知识感知（入模前确定性上下文组装）                                                  | ✅ 生产 / Stable                           |
| 多模型 Provider / Multi-provider                  | **22** 个 LLM Provider + 回退链 + 提示缓存 + 推理捕获                                                     | ✅ 生产 / Stable                           |
| 向量库 / Vector DBs                               | **10** 种（LanceDB / Chroma / Pinecone / Qdrant / Weaviate / Milvus / PgVector 等）                       | ✅ 生产 / Stable                           |
| Embedding 引擎 / Embeddings                       | **16** 种（OpenAI / Cohere / Jina / Voyage / Ollama / 本地 等）                                           | ✅ 生产 / Stable                           |
| Agent 工具 / Agent tools                          | **34** 个 AIbitat 插件：SQL/DuckDB Agent、PPT/PDF/DOCX/XLSX 生成、网页浏览/抓取、图表、文档审阅、MCP 桥等 | ✅ 生产 / Stable                           |
| **多 Agent 团队编排** / Multi-agent orchestration | LLM Planner → 步骤分派 → 受控执行 + 耐久 HITL + 护栏 + 追踪（`@团队` / `@team`）                          | 🧪 **Preview**（flag 可开启 / flag-gated） |
| 自主工作执行 / Autonomous work-agent              | submit → execute → approve → artifact，Mastra 引擎，成本估算 + 安全策略                                   | ✅ 生产 / Stable                           |
| 可观测性 / Observability                          | OpenTelemetry 四层 span，PII 安全，零默认开销                                                             | ✅ 生产 / Stable                           |
| 安全护栏 / Guardrails                             | 注入检测（中英）+ PII 红化 + 审计 hook                                                                    | ✅ 编排已接 / 单聊待接                     |
| 结构化输出 / Structured output                    | `generateStructured` + zod 校验 + 修复救回                                                                | ✅ 生产 / Stable                           |
| 推理流 / Reasoning stream                         | Anthropic `thinking` + DeepSeek `reasoning_content` → 前端折叠推理块                                      | ✅ 生产 / Stable                           |
| Evals / 离线评测                                  | scorer 抽象 + 启发式打分 + LLM-judge hook + CLI（CI 默认非阻塞）                                          | ✅ 工具就绪 / Tooling ready                |
| Skills / SkillHub                                 | 技能市场 + 生命周期管理 + 起步技能包                                                                      | ✅ 生产 / Stable                           |
| MCP                                               | Model Context Protocol 双向集成（hub + hypervisor）                                                       | ✅ 生产 / Stable                           |
| IM Gateway                                        | 飞书 / 微信 / 自定义渠道适配，独立或 sidecar 部署                                                         | ✅ 生产 / Stable                           |
| 桌面端 / Desktop                                  | Electron 打包 server + collector + IM Gateway 三 sidecar（macOS）                                         | ✅ 生产 / Stable                           |
| 长期记忆 Broker（Molt） / Long-term memory        | 多 Agent 会话持久化 + 健康监测 + 孤儿清理                                                                 | 🧪 Preview（`MOLT_ENABLED` 默认关）        |

---

## 多 Agent 团队编排（Preview） · Multi-Agent Team Orchestration (Preview)

**中文**

这是本项目相对上游 AnythingLLM 最重要的能力之一，已完整交付（M0 桥接原语 + M1 编排/耐久 HITL + 5 项能力，**622+ 测试全绿、零回归**），并已接入聊天主链路 `server/utils/chats/stream.js`。

工作方式：

1. 用户在聊天中以 `@团队` / `@team` 触发，或对话发给「团队助手」。
2. **LLM Planner** 把目标拆解为结构化步骤（带 schema 校验 + 修复救回）。
3. **TeamOrchestrationService** 受控循环执行每一步：把前序结果注入上下文 → 调 `run_employee` → 检查是否需要审批。
4. **耐久 HITL**：高风险工具触发 `ApprovalBroker`（DB 持久 + 幂等），可在进程重启后从保存状态恢复。
5. **全程护栏 + 追踪**：input 注入检测/output PII 红化；OTel 四层 span（`team.orchestration → team.step → employee.run → tool.<name> → llm.<provider>`）。

> **为什么默认关闭（`TEAM_ORCHESTRATION_ENABLED=false`）？**
> 这是**安全发布**姿势，让这套大特性能"零回归"进入主干，而非对成果的保留。开启前建议补齐：① plan 级人工确认门、② 单员工聊天侧 guardrail（流式输出红化）、③ 一轮真实场景灰度。完成后即可水到渠成地翻开开关。

开启方式：设置环境变量 `TEAM_ORCHESTRATION_ENABLED=true`，然后在聊天中使用 `@团队` / `@team`。

**English**

This is one of the most significant capabilities over upstream AnythingLLM. It is fully delivered (M0 bridge primitives + M1 orchestration / durable HITL + 5 capability tracks, **622+ tests green, zero regression**) and wired into the main chat path at `server/utils/chats/stream.js`.

How it works:

1. The user triggers it in chat with `@团队` / `@team`, or by messaging a "team assistant".
2. An **LLM planner** decomposes the goal into structured steps (schema-validated, with repair/rescue).
3. **TeamOrchestrationService** runs each step in a controlled loop: prior results are injected as context → `run_employee` is called → an approval check runs.
4. **Durable HITL**: high-risk tools trigger the `ApprovalBroker` (DB-persisted, idempotent) and can resume from saved state after a process restart.
5. **Guardrails + tracing throughout**: input injection detection / output PII redaction; 4-layer OTel spans.

> **Why default-off (`TEAM_ORCHESTRATION_ENABLED=false`)?**
> This is a **safe-rollout** posture that lets the feature land on main with zero regression — not a lack of confidence. Before turning it on, we recommend closing: (1) a plan-level approval gate, (2) single-employee chat-side guardrails (streaming-output redaction), and (3) a real-world canary pass. After that, flipping the flag is straightforward.

To enable: set `TEAM_ORCHESTRATION_ENABLED=true`, then use `@团队` / `@team` in chat.

---

## Agent 引擎架构 · Agent Engine Architecture

**中文**

当前生产聊天仍由 **AIbitat** 执行；Phase 3 提供了
`ChatAgentEngine` 类型契约和纯选择策略，供未来受控迁移使用：

- **AIbitat**（`server/utils/agents/`）——承载所有聊天 / `@agent` / AI 员工 / 多 Agent 团队编排。AnythingLLM 自研的"对话 + 调工具"循环，框架层**原生支持多 Agent**（`.agent()` / `.channel()`）。
- **work-agent（Mastra 引擎）**（`server/utils/workAgent/`）——独立的自主任务执行子系统，跑在 `@mastra/core` 上；它不是已接线的 Mastra 聊天实现。

**方向（证据门控）**：当前策略测试定义了未来调用方必须实现的会话固定、灰度和回滚语义，但尚无生产调用方持久化该选择，也没有 Mastra 聊天实现。只有逐项达到功能与事件协议同等性后，聊天流量才可迁移。FDE 工作流不采用 Mastra 编排：控制流、检查点、审批与恢复始终由 Studio/Prisma 拥有。

> 📐 完整说明（两套引擎现状、Mastra 现成能力、分阶段收敛路线）以 [`docs/AGENT_ARCHITECTURE.md`](docs/AGENT_ARCHITECTURE.md) 为**权威**。

**English**

Production chat currently runs on **AIbitat**. Phase 3 delivered a
`ChatAgentEngine` type contract and pure selection policy for a future
controlled migration:

- **AIbitat** (`server/utils/agents/`) — powers all chat / `@agent` / AI employees / multi-agent orchestration. A provider-agnostic "chat + tool-call" loop with **native multi-agent support** (`.agent()` / `.channel()`).
- **work-agent (Mastra engine)** (`server/utils/workAgent/`) — a standalone autonomous-execution subsystem on `@mastra/core`; it is not a wired Mastra chat implementation.

**Direction (evidence-gated)**: policy tests define the session-pinning, canary,
and rollback semantics that a future caller must persist. No production caller
or Mastra chat implementation is wired today. Chat traffic may move only after
capability and event-protocol parity. FDE workflows do not use Mastra
orchestration: Studio/Prisma owns graph control, checkpoints, approvals, and
recovery.

> 📐 The **authoritative** description lives in [`docs/AGENT_ARCHITECTURE.md`](docs/AGENT_ARCHITECTURE.md).

---

## 可观测性与安全 · Observability & Safety

**中文**

- **可观测性**：`server/utils/observability/otel.js`。默认零开销（未设 `OTEL_EXPORTER` 即 no-op）；可导出 Console / OTLP（Jaeger·Tempo·Honeycomb）/ Langfuse。Span 层级 `team.orchestration → team.step → employee.run → tool.<name> → llm.<provider>`，**只记 ID/计数/状态，绝不记用户原文**。详见 [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md)。
- **安全护栏**：`server/utils/agents/guardrails/`。注入检测（中英启发式）+ PII 红化（编号占位）+ 审计 hook，已接入团队编排（input 检测/block + output 红化，覆盖 resume）。
- **HITL 权限网关**：`server/utils/permissions/`。风险分级 + allow/deny + scoped tools + 工具级审批 + 审计 + 确认持久化。

**English**

- **Observability**: `server/utils/observability/otel.js`. Zero overhead by default (no-op unless `OTEL_EXPORTER` is set); exports to Console / OTLP / Langfuse. Spans record only IDs/counts/status — never user text. See [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md).
- **Guardrails**: `server/utils/agents/guardrails/`. Injection detection (EN+ZH) + PII redaction + audit hooks, wired into team orchestration.
- **HITL gates**: `server/utils/permissions/`. Risk tiers + allow/deny + scoped tools + per-tool approval + audit + durable confirmation.

---

## 目录结构 · Project Structure

- `frontend/`：Vite + React 工作台 UI / workbench UI
- `server/`：Node.js / Express 服务端（API、Workspace、RAG、Agents、Orchestration）
- `collector/`：文档采集与解析服务 / document ingestion & parsing
- `cli/alata/`：主项目 control CLI（gateway / approvals）
- `alata-im-gateway/`：独立 runtime bridge（CLI、Docker、sidecar）/ IM gateway
- `docker/`：Docker / Compose 配置（含 `docker-compose.lite.yml`）
- `cloud-deployments/`、`k8s/`：云与 K8s 部署示例 / cloud & K8s examples
- `electron/`、`dist-electron/`：桌面端打包 / desktop bundle
- `services/`：可选侧车服务（如 `paddleocr-service`）/ optional sidecars
- `embed/`、`browser-extension/`：嵌入式组件与浏览器扩展 / embed widget & extension
- `docs/`：产品/设计/运维文档集合（含 `AGENT_ARCHITECTURE.md`、`OBSERVABILITY.md`）

说明 / Note：`docs/` 中部分为"方案/提案类"文档，不保证与当前实现完全一致；Agent 能力以 `AGENT_ARCHITECTURE.md` 为准。

---

## 环境要求 · Requirements

- Node.js `>= 20`（见 `.nvmrc`）
- Yarn 4（建议 `corepack enable`）
- SQLite（本地开发默认 / default for local dev）

---

## 快速开始（本地开发） · Quick Start (local dev)

```bash
git clone https://github.com/AlataChan/octopus_studio.git
cd octopus_studio

corepack enable
yarn install
yarn prisma:setup
yarn dev:all
```

这会通过根 Yarn workspace 一次性安装 `server`、`frontend`、`collector`、`embed`、`browser-extension`、`alata-im-gateway` 与 `cli/alata` 的依赖。`yarn dev:all` 会启动核心开发服务：

```bash
yarn dev:server
yarn dev:collector
yarn dev:frontend
```

IM Gateway 通常按需启动 / start on demand：`yarn dev:gateway`。

---

## 视觉生成（可选边车） · Visual Production (optional sidecar)

**中文**

视觉生成以 Python 边车服务接入 Studio，前端页面为 `/visual`，Manager 及以上角色可见。它负责图片/视频生成路由、成本估算、任务轮询、结果下载、视频拼接与中文标题卡；Node 服务只通过 `/api/visual/*` 代理到本机边车。

首次使用先安装边车依赖：

```bash
cd services/visual-production
./setup.sh
```

开发启动：

```bash
yarn dev:visual
# 或随完整开发栈启动
yarn dev:all:full
```

默认监听 `127.0.0.1:8868`，可用 `VISUAL_PRODUCTION_PORT` 调整端口。探活与配置读取共用 `GET /api/config`。Provider key 可放在边车进程环境变量（`ARK_API_KEY` / `DASHSCOPE_API_KEY` / `AGNES_API_KEY`），也可由浏览器会话通过 `/visual` 请求头覆盖；Studio Node 服务不保存这些视觉生成 key。

Agent 工具：`visual-generate` 是可选 Business 级 AIbitat 工具，默认不开启，也不属于始终注入的输出工具。管理员可在 Agent 技能设置中开启"视觉生成"，或在系统设置 `default_agent_skills` 中加入 `"visual-generate"`。启用前需先运行 `yarn dev:visual`，并在边车进程环境中配置 provider key。对话中可让 `@agent` 生成海报/视频；若估算成本超过阈值，agent 会拒绝自动提交并引导用户到 `/visual` 页面确认，LLM 不能通过工具参数绕过该边界。边车未启动时，agent 返回"视觉服务未启动"提示而不是抛错中断对话。

与 OCR 边车一致，Electron 桌面包默认不内置该 Python 服务。服务未启动时，`/visual` 会显示"视觉服务未启动"并禁用提交，其余 Studio 功能继续可用。详细命令与接口见 [`services/visual-production/README.md`](services/visual-production/README.md)。

**English**

Visual production is integrated as an optional Python sidecar. The Studio page is `/visual` and is visible to manager/admin users. It handles image/video routing, cost estimates, job polling, result downloads, video stitching, and Chinese title-card composition; the Node server only proxies `/api/visual/*` to the local sidecar.

First-time setup:

```bash
cd services/visual-production
./setup.sh
```

Development startup:

```bash
yarn dev:visual
# or with the full local stack
yarn dev:all:full
```

The default bind is `127.0.0.1:8868`; override it with `VISUAL_PRODUCTION_PORT`. Readiness and config both use `GET /api/config`. Provider keys can come from sidecar environment variables (`ARK_API_KEY` / `DASHSCOPE_API_KEY` / `AGNES_API_KEY`) or browser-session override headers from `/visual`; Studio's Node process does not persist those visual keys.

Agent tool: `visual-generate` is an optional Business-level AIbitat tool. It is off by default and is not part of the always-on output tool set. Admins can enable "Visual Generation" in Agent skill settings, or add `"visual-generate"` to the `default_agent_skills` system setting. The sidecar must be running through `yarn dev:visual`, with provider keys configured in the sidecar process environment. In chat, `@agent` can generate posters or videos; if the estimated cost exceeds the configured threshold, the agent refuses to submit automatically and sends the user to `/visual` for confirmation. The LLM cannot bypass this through tool arguments. If the sidecar is down, the agent returns a "visual service not started" message instead of throwing through the conversation.

Like the OCR sidecar, this Python service is not bundled into Electron by default. If it is not running, `/visual` shows a graceful "visual service not started" state and disables submit controls while the rest of Studio remains usable. See [`services/visual-production/README.md`](services/visual-production/README.md) for the full sidecar guide.

---

## 功能开关 · Feature Flags

部分企业级能力默认关闭，按需通过环境变量开启 / Some enterprise features are off by default and enabled via env vars:

| 开关 / Flag                        | 默认 / Default | 作用 / Effect                                                                                                                                          |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TEAM_ORCHESTRATION_ENABLED`       | `false`        | 多 Agent 团队编排（`@团队` / `@team`）/ multi-agent orchestration                                                                                      |
| `TEAM_PLAN_APPROVAL_ENABLED`       | `false`        | 团队计划级人工确认门 / plan-level approval gate                                                                                                        |
| `READONLY_SUBAGENT_ENABLED`        | `false`        | 只读研究子 agent（`research` 工具）/ read-only research sub-agent                                                                                      |
| `TEAM_RECITATION_ENABLED`          | `false`        | 团队复诵注入 + plan.md 工件 / plan recitation + artifact                                                                                               |
| `MOLT_ENABLED`                     | `false`        | Molt 长期记忆 Broker / long-term memory broker（另需 `MOLT_BASE_URL` + token）                                                                         |
| `GUARDRAILS_CHAT_ENABLED`          | `false`        | 单员工聊天注入 block + 落库 prompt/response PII 红化（方案C；platform 模式 v1 不覆盖）/ chat injection block + persisted prompt/response PII redaction |
| `TOOL_RESULT_OFFLOAD_ENABLED`      | `false`        | 工具超大输出落盘传句柄 / offload oversized tool output to disk                                                                                         |
| `CONTEXT_COMPACTION_ENABLED`       | `false`        | 历史 token 预算压实（近期逐字+旧轮摘要）/ token-budget history compaction                                                                              |
| `CONTEXT_COMPACTION_BUDGET_TOKENS` | `8000`         | 压实触发/收敛的 token 预算 / budget that bounds compaction                                                                                             |
| `CONTEXT_COMPACTION_SOURCE_WINDOW` | `100`          | 压实前抓取的历史条数 / history rows fetched before compaction                                                                                          |
| `OTEL_EXPORTER`                    | 未设 / unset   | 开启 OpenTelemetry 导出 / enable OTel export（Console / OTLP / Langfuse）                                                                              |

> work-agent（Mastra 自主执行）默认启用；旧 `octopus` adapter 已在兼容资产吸收完成后退役。

---

## 运行时数据 / 缓存目录说明（不入库） · Runtime data (not committed)

以下目录/产物为 **运行时或可再生成**，仓库默认不提交：

- `node_modules/`
- `frontend/dist/`
- `server/coverage/`
- `server/storage/`（SQLite DB、上传文档、向量缓存、LanceDB、本地模型缓存等）

如果遇到 `SQLITE_FILE_CANNOT_BE_OPENED`，可手动创建：

```bash
mkdir -p server/storage
touch server/storage/anythingllm.db
```

注意：`server/public` 是指向 `frontend/dist` 的软链接，生产环境需要先构建前端。

---

## 生产 / 部署 · Production / Deployment

- 构建前端：`yarn prod:frontend`
- 启动服务端：`yarn prod:server`

Docker：

- 推荐入口：`docker/HOW_TO_USE_DOCKER.md`
- 推荐编排：`docker/docker-compose.lite.yml`（默认完整项目：主服务 + MinIO + PostgreSQL + IM Gateway + agency-agents 初始化）
- 完整镜像：`docker/docker-compose.alata.yml`（同样默认完整项目，但系统依赖更全）
- 上游兼容单容器：`docker/docker-compose.yml`
- 本地 Ollama 变体：`docker/docker-compose.ollama.yml`

生产 Docker 镜像不会内置 `.env` 文件。生产部署必须通过 `env_file`、Docker Compose 环境变量或 K8s Secret 注入以下必需变量：

- `JWT_SECRET`：强随机密钥，建议至少 32 字节。
- `AUTH_TOKEN`：单用户模式登录密码。
- `SIG_KEY`：`EncryptionManager` 使用的强随机 hex 密钥。
- `SIG_SALT`：`EncryptionManager` 使用的强随机 hex salt。

建议用以下命令为每个密钥生成独立值：

```bash
openssl rand -hex 32
```

当 `NODE_ENV=production` 或 `REQUIRE_PRODUCTION_SECRETS=true` 时，缺少上述任一变量会导致容器启动失败。启动脚本也会拒绝包含 `change-me`、`changeme`、`your-`、`example`、`placeholder` 等占位模式的值，并在错误信息中提示变量名和生成命令。`dev` / 本地开发模式可省略这些变量，服务会使用临时值，适合本地调试但不适合生产。

生产模式还必须显式配置跨域来源，避免默认 `origin: true` 与 `credentials: true` 组合误用于外部部署：

```bash
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

如需继续允许所有来源，必须显式设置 `CORS_ALLOWED_ORIGINS=*`。嵌入式聊天组件的公开接口（`/api/embed/:embedId/stream-chat` 与 `/api/embed/:embedId/:sessionId`）会继续允许客户站点来源访问，但不允许 credentialed CORS；嵌入配置中的允许域名与会话密钥仍负责限制实际访问。

以下变量按部署拓扑可选，但如果设置为占位值，同样会被生产启动脚本拒绝：

- `INTERNAL_API_SECRET`：主服务与 IM Gateway / sidecar 之间的内部 bearer secret。
- `ALATA_GATEWAY_API_KEY`：IM Gateway 调用主服务 API 的共享密钥。

默认生产模式下缺少这些可选变量只会打印警告；如果设置 `REQUIRE_PRODUCTION_SECRETS=true`，它们也会变为必需变量。

IM Gateway 独立进程在 `NODE_ENV=production` 且非桌面运行时还必须设置 `ADMIN_SECRET`。该值用于保护 gateway 管理接口，缺失或包含占位模式时 gateway 会拒绝启动；同样建议使用 `openssl rand -hex 32` 生成。

SQL Agent 生产部署建议使用专用只读数据库账号，配置参考：`docs/deployment/sql-agent-readonly-db.md`

裸机部署参考：`BARE_METAL.md`

Electron：

- Sidecar staging：`yarn electron:stage:arm64`
- Bundle verify：`yarn electron:verify`
- Signed macOS build：`yarn electron:build:arm64`
- Signed local macOS build without TSA timestamp：`yarn electron:build:arm64:signed-local`
- Unsigned local smoke build：`yarn electron:build:arm64:unsigned`
- 当前桌面打包链已覆盖 `server`、`collector`、`alata-im-gateway` 三个 sidecar
- 说明：正式 signed build 依赖本机可用的 Apple codesign identity 与 timestamp 服务；如本机 TSA 不稳定，可先用 `signed-local` 做本地验证

### Electron 桌面安全与 macOS Entitlements

桌面版默认是单用户本地应用模型。Electron 主进程会启动 `server`、`collector`、`alata-im-gateway` 三个 sidecar，并把它们绑定到 `127.0.0.1`。这避免了局域网入站暴露，但同一台机器上的本地进程仍可访问这些本地 API；这是 AnythingLLM 桌面模型的既有取舍。安全敏感场景建议启用多用户模式，并使用独立的生产密钥配置。

桌面渲染进程的生产 CSP 将 `connect-src` 限制在 `self` 与本地 loopback sidecar，降低渲染进程向外部站点发起数据外泄请求的风险。`img-src` 仍允许任意 `https:` 图片以兼容远程头像、图标和内容图片；图片信标风险已评估接受，因为脚本与 XHR/WebSocket 外联通道已被 `connect-src` 收紧。浏览器经 DNS rebinding 访问本地 sidecar 的风险由 Host/CORS 校验部分缓解；不要把桌面 sidecar 改为非 loopback 绑定。

当前 `electron/entitlements.mac.plist` 在删除 `com.apple.security.cs.allow-dyld-environment-variables` 后保留以下 entitlements：

| Entitlement                                              | 必需原因                                                                                                                                                                   | 移除前置条件                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `com.apple.security.cs.allow-jit`                        | Electron/Chromium V8 在 hardened runtime 下需要 JIT。                                                                                                                      | 不计划移除，除非 Electron/Chromium 运行模式改变。                               |
| `com.apple.security.cs.allow-unsigned-executable-memory` | sidecar 原生 `.node` 模块尚未做 Team-ID 签名，且 `electron-builder.config.cjs` 的 `signIgnore` 跳过 `server`、`collector`、`alata-im-gateway`、`frontend` 资源逐文件签名。 | 对 sidecar 原生模块完成 Team-ID 签名后，做 signed build + 公证 + 启动冒烟验证。 |
| `com.apple.security.cs.disable-library-validation`       | sidecar 原生 `.node` 模块当前不在 Apple library validation 链内。                                                                                                          | 同上：完成 sidecar 原生模块签名并验证可启动后再移除。                           |
| `com.apple.security.network.client`                      | 桌面运行时需要访问模型供应商、本地 sidecar 与业务 API。                                                                                                                    | 不计划移除。                                                                    |
| `com.apple.security.network.server`                      | Electron 桌面版会启动 loopback HTTP/WS sidecar 供渲染进程访问。                                                                                                            | 只有在改为不启动本地服务的桌面架构后才可移除。                                  |
| `com.apple.security.files.user-selected.read-write`      | 支持用户选择的导入/导出路径。运行时数据仍优先使用 app userData 目录。                                                                                                      | 只有在移除用户选择文件导入/导出能力后才可移除。                                 |

签名构建机检查清单：

```bash
yarn electron:stage:arm64
node scripts/electron/verify-bundle.mjs --sidecarDir=.electron-build/sidecars --arch=arm64
yarn electron:build:arm64
codesign --verify --deep --strict --verbose=2 "dist-electron/mac-arm64/Alata Studio.app"
codesign -d --entitlements :- "dist-electron/mac-arm64/Alata Studio.app"
spctl --assess --type execute -vv "dist-electron/mac-arm64/Alata Studio.app"
```

Entitlements 检查时应确认 `com.apple.security.cs.allow-dyld-environment-variables` 不再出现。`disable-library-validation` 与 `allow-unsigned-executable-memory` 是独立后续收敛项，不要在 sidecar 原生模块签名验证完成前删除。

`package.json` 仍保留 `electron:build:x64` 脚本，但 `electron-builder.config.cjs` 当前 `mac.target` 只输出 arm64 DMG。如果 x64 不是对外发布目标，后续应删除 x64 脚本；如果需要 x64 发布，则应给 builder 增加 x64 target 并补对应签名/公证验证。

---

## 文档索引（推荐） · Docs Index

- **Agent 架构（权威）** / Agent architecture：[`docs/AGENT_ARCHITECTURE.md`](docs/AGENT_ARCHITECTURE.md)
- **可观测性 / OTel span 词表** / Observability：[`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md)
- Docker 使用说明：`docker/HOW_TO_USE_DOCKER.md`
- SQL Agent 只读数据库账号：`docs/deployment/sql-agent-readonly-db.md`
- 轻量化设计与取舍：`docs/3_LIGHTWEIGHT_OPTIMIZATION_PLAN.md`
- IM Gateway 独立运行说明：`docs/2_IM_GATEWAY_STANDALONE_PROJECT.md`
- 故障排查：`TROUBLESHOOTING.md`、`docs/zh-CN/TROUBLESHOOTING.md`
- 变更记录：`docs/CHANGELOG.md`
- 本地模型部署（中文）：`docs/zh-CN/LOCAL_LLM_DEPLOYMENT.md`、`docs/zh-CN/OLLAMA_SETUP.md`

---

## 许可与致谢 · License & Credits

本项目以 MIT 协议开源（见 `LICENSE`），并基于 AnythingLLM（MIT）衍生与维护：[`Mintplex-Labs/anything-llm`](https://github.com/Mintplex-Labs/anything-llm)。

Licensed under MIT (see `LICENSE`); derived from and maintained on top of AnythingLLM (MIT) by Mintplex Labs.
