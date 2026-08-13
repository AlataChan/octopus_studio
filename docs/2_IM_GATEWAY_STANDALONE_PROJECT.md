# Alata IM Gateway — 独立项目实施方案

- 版本：`v1.0`
- 日期：`2026-02-06`
- 状态：`Draft`
- 关联文档：`ENTERPRISE_IM_GATEWAY_IMPLEMENTATION_PLAN.md`（内嵌方案，已归档为对比参考）

## 1. 决策背景

### 1.1 为什么做独立项目

经过对 Alata Studio（v1.9.0）代码库的完整审计，得出以下判断：

- Alata 现有 API 已覆盖 IM 网关 ~85% 的需求（对话、线程、HITL、搜索、工作区管理）。
- IM 渠道的运维特征（高频 webhook、平台 API 频繁变更、按渠道独立扩缩）与 Alata 核心（LLM 编排、RAG、知识图谱）完全不同。
- 内嵌方案需要改动 Alata 10+ 个文件、5000+ 行散布变更；独立项目仅需 ~2500 行新代码 + Alata 侧补 ~200 行 API。

### 1.2 独立 vs 内嵌 决策矩阵

| 维度         | 内嵌到 Alata                | 独立项目                         |
| ------------ | --------------------------- | -------------------------------- |
| 代码量       | 改动散布 10+ 文件           | ~2500 行集中代码                 |
| 部署灵活性   | 与 Alata 绑定部署           | 独立容器，按渠道扩缩             |
| 故障隔离     | webhook 异常影响 Alata 核心 | 网关崩溃不影响 Alata             |
| 开发速度     | 需深入 Alata 全代码库       | 只需熟悉 API 文档                |
| 迭代自由度   | 受 Alata 发版节奏约束       | 独立迭代                         |
| 团队协作     | 与核心开发争用代码          | 可由独立团队负责                 |
| 技术栈自由   | 必须 Node.js + Prisma       | 任意（Node/Go/Python）           |
| API 延迟开销 | 0ms（内部调用）             | ~1-5ms（LLM 耗时 2-30s，可忽略） |
| 可复用性     | 绑定单 Alata 实例           | 同一网关可对接多 Alata 实例      |

---

## 2. 架构设计

### 2.1 整体拓扑

```text
┌─────────────────────────────────────────────────────┐
│            alata-im-gateway（独立项目）                │
│                                                       │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │  Feishu    │  │  WeCom     │  │  Future:      │  │
│  │  Adapter   │  │  Adapter   │  │  DingTalk/... │  │
│  └─────┬──────┘  └──────┬─────┘  └───────┬───────┘  │
│        └────────┬───────┘                 │          │
│            ┌────▼─────┐                   │          │
│            │ Message   │◄─────────────────┘          │
│            │ Queue     │                              │
│            └────┬──────┘                              │
│            ┌────▼─────┐                               │
│            │ Router   │                               │
│            │ Engine   │                               │
│            └────┬─────┘                               │
│            ┌────▼──────────┐    ┌──────────────┐     │
│            │ Session       │───►│ SQLite /     │     │
│            │ Manager       │    │ Redis        │     │
│            └────┬──────────┘    └──────────────┘     │
│            ┌────▼─────┐                               │
│            │ Alata    │  HTTP / SSE                   │
│            │ Client   │───────────────────────┐      │
│            └──────────┘                       │      │
│            ┌──────────┐                       │      │
│            │ Outbound │◄──────────────────────┤      │
│            │ Sender   │                       │      │
│            └──────────┘                       │      │
└───────────────────────────────────────────────┼──────┘
                                                │
                  ┌─────────────────────────────▼───┐
                  │        Alata Studio（核心）       │
                  │                                   │
                  │  POST /v1/workspace/:slug/        │
                  │       thread/:threadSlug/         │
                  │       stream-chat                 │
                  │  POST /v1/workspace/:slug/        │
                  │       thread/new                  │
                  │  GET  /v1/workspace/:slug/        │
                  │       thread/:threadSlug/chats    │
                  │  GET  /api/workspace/:slug/       │
                  │       confirmations/pending       │
                  │  POST /agent-flows/:uuid/run *    │
                  │                                   │
                  │  * 待补齐的 API                    │
                  └───────────────────────────────────┘
```

### 2.2 核心原则

1. **网关是纯 API 消费者** — 零数据库直连，所有 Agent 能力通过 Alata API 调用。
2. **网关只管"信封"** — 负责渠道适配、路由、会话映射、安全拦截；不管"信的内容"（LLM/RAG/Skills）。
3. **Alata 是"真相源"** — 对话历史、线程状态、知识库全部存储在 Alata 侧。网关仅保存映射关系。
4. **渠道故障不传染** — 飞书 webhook 异常不影响企微，任何渠道异常不影响 Alata 核心。

---

## 3. Alata 侧 API 依赖清单

### 3.1 现有 API（可直接使用）

| 能力         | 端点                                                 | 方法   | 说明                                         |
| ------------ | ---------------------------------------------------- | ------ | -------------------------------------------- |
| 创建线程     | `/v1/workspace/:slug/thread/new`                     | POST   | body: `{ userId, name, slug }`               |
| 流式对话     | `/v1/workspace/:slug/thread/:threadSlug/stream-chat` | POST   | body: `{ message, mode, attachments }` → SSE |
| 同步对话     | `/v1/workspace/:slug/thread/:threadSlug/chat`        | POST   | body: `{ message, mode }` → JSON             |
| 获取历史     | `/v1/workspace/:slug/thread/:threadSlug/chats`       | GET    | 返回 role/content/sentAt                     |
| 删除线程     | `/v1/workspace/:slug/thread/:threadSlug`             | DELETE |                                              |
| 工作区对话   | `/v1/workspace/:slug/stream-chat`                    | POST   | 无线程时直接对话                             |
| OpenAI 兼容  | `/v1/openai/chat/completions`                        | POST   | model = workspace slug                       |
| 向量搜索     | `/v1/workspace/:slug/vector-search`                  | POST   | body: `{ query, topN, scoreThreshold }`      |
| HITL 待审批  | `/api/workspace/:slug/confirmations/pending`         | GET    | 拉取模式                                     |
| HITL 批准    | `/api/workspace/:slug/confirmations/:id/approve`     | POST   | body: `{ userResponse }`                     |
| HITL 拒绝    | `/api/workspace/:slug/confirmations/:id/reject`      | POST   | body: `{ userResponse }`                     |
| 工作区列表   | `/v1/workspaces`                                     | GET    |                                              |
| Agent 状态   | `/agent-status/summary`                              | GET    | 工具 + Flow + MCP 汇总                       |
| API Key 验证 | Header `Authorization: Bearer <key>`                 | —      | 所有 `/v1/*` 端点                            |

### 3.2 待补齐 API（Alata 侧改动）

| 能力              | 建议端点                                | 工作量 | 说明                                                                  |
| ----------------- | --------------------------------------- | ------ | --------------------------------------------------------------------- |
| Flow 执行         | `POST /v1/agent-flows/:uuid/run`        | 1-2 天 | 代码骨架已存在（agentFlows.js:104-135，当前被注释），需取消注释并完善 |
| HITL Webhook 回调 | 配置项：`hitl.webhookUrl`               | 2-3 天 | 审批通过/拒绝时 POST 到回调 URL，避免网关轮询                         |
| Agent 直接调用    | `POST /v1/workspace/:slug/agent/invoke` | 1-2 天 | 将现有 WebSocket agent invocation 包装为 REST 端点                    |

**Alata 侧总改动量：~200-300 行，约 1 周。**

---

## 4. 网关项目结构

### 4.1 目录结构

```text
alata-im-gateway/
├── src/
│   ├── index.js                    # Express 入口 + 中间件链
│   ├── adapters/                   # 渠道适配器
│   │   ├── ChannelAdapter.js       # 抽象接口
│   │   ├── FeishuAdapter.js        # 飞书实现
│   │   └── WeComAdapter.js         # 企微实现
│   ├── router/                     # 路由引擎
│   │   ├── BindingMatcher.js       # 绑定规则匹配（优先级 + 回退）
│   │   ├── RouteResolver.js        # 路由决策 + 冲突检测
│   │   └── bindings.js             # 绑定规则加载
│   ├── session/                    # 会话管理
│   │   └── SessionManager.js       # channel+peer ↔ Alata thread 映射
│   ├── queue/                      # 异步处理
│   │   └── MessageQueue.js         # 入站消息队列 + worker
│   ├── client/                     # Alata API 客户端
│   │   └── AlataClient.js          # 封装所有 Alata API 调用
│   ├── security/                   # 安全层
│   │   ├── webhookVerifier.js      # Webhook 签名校验
│   │   ├── commandFilter.js        # 命令拦截
│   │   ├── rateLimiter.js          # 渠道维度速率限制
│   │   └── credentialStore.js      # 凭据加密存储
│   ├── outbound/                   # 出站发送
│   │   ├── Sender.js               # 统一发送器（重试 + 错误分类）
│   │   └── errorTemplates.js       # 错误消息模板
│   ├── audit/                      # 审计日志
│   │   └── AuditLogger.js          # 消息事件记录
│   ├── admin/                      # 管理 API
│   │   └── routes.js               # 绑定规则 CRUD、健康检查
│   └── config/                     # 配置
│       ├── default.js              # 默认配置
│       └── schema.js               # 配置校验 schema
├── data/                           # 本地数据（SQLite + 凭据）
│   └── gateway.db
├── test/
│   ├── unit/                       # 单元测试
│   ├── integration/                # 集成测试（mock Alata API）
│   └── mocks/                      # Webhook 模拟器
│       ├── feishuWebhook.js
│       └── wecomWebhook.js
├── Dockerfile
├── docker-compose.yml              # 含 Alata 联调配置
├── .env.example
└── package.json
```

### 4.2 依赖清单（极简）

```json
{
  "name": "alata-im-gateway",
  "version": "0.1.0",
  "dependencies": {
    "express": "^4.21.0",
    "axios": "^1.7.0",
    "fastq": "^1.17.0",
    "better-sqlite3": "^11.0.0",
    "node-cache": "^5.1.2",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0",
    "express-rate-limit": "^7.4.0",
    "joi": "^17.13.0",
    "dotenv": "^16.4.0",
    "crypto-js": "^4.2.0"
  },
  "devDependencies": {
    "jest": "^30.0.0",
    "supertest": "^7.0.0",
    "nock": "^14.0.0"
  }
}
```

**为什么选这些：**

- `fastq` — 零依赖的高性能进程内队列，避免引入 Redis（v1）。
- `better-sqlite3` — 同步 SQLite，用于会话映射和审计日志，单文件部署。
- `node-cache` — 事件去重缓存（TTL 自动过期）。
- `nock` — HTTP mock，测试时拦截 Alata API 调用。

---

## 5. 核心模块设计

### 5.1 ChannelAdapter 接口

```javascript
/**
 * 所有渠道适配器必须实现的接口。
 * 网关层仅通过此接口与具体渠道交互，确保完全解耦。
 */
class ChannelAdapter {
  /** @returns {"feishu"|"wecom"} 渠道标识 */
  get provider() {
    throw new Error("not implemented");
  }

  // ── 入站 ──

  /**
   * 校验 webhook 请求签名。
   * @param {express.Request} req
   * @returns {boolean}
   */
  verifyWebhook(req) {}

  /**
   * 将平台原始事件解析为标准消息。
   * @param {Object} rawEvent - 平台原始 webhook body
   * @returns {StandardMessage|null} - null 表示非消息事件（如 URL 验证）
   */
  parseEvent(rawEvent) {}

  /**
   * 事件去重。
   * @param {string} eventId - 平台事件 ID
   * @returns {boolean} - true 表示重复
   */
  isDuplicate(eventId) {}

  // ── 出站 ──

  /**
   * 发送文本回复。
   * @param {Peer} peer - 回复目标
   * @param {string} text - 文本内容
   * @returns {Promise<SendResult>}
   */
  async sendTextReply(peer, text) {}

  /**
   * 发送富文本/卡片回复。
   * @param {Peer} peer - 回复目标
   * @param {Object} richContent - 富文本内容（适配器自行格式化）
   * @returns {Promise<SendResult>}
   */
  async sendRichReply(peer, richContent) {}

  /**
   * 发送错误反馈。
   * @param {Peer} peer - 回复目标
   * @param {ErrorType} errorType - 错误类型枚举
   * @param {string} [lang="zh"] - 语言
   * @returns {Promise<SendResult>}
   */
  async sendErrorFeedback(peer, errorType, lang) {}

  // ── 生命周期 ──

  /** 主动刷新 access_token */
  async refreshCredentials() {}

  /** 健康检查 */
  async healthCheck() {}
}
```

### 5.2 StandardMessage 标准消息格式

```javascript
/**
 * @typedef {Object} StandardMessage
 * @property {string} messageId    - 平台消息 ID
 * @property {string} eventId      - 平台事件 ID（去重键）
 * @property {"feishu"|"wecom"} provider
 * @property {string} accountId    - 应用/租户 ID
 * @property {"user"|"group"} peerType
 * @property {string} peerId       - 群 ID 或用户 open_id
 * @property {string} senderId     - 发送者 ID（飞书 ou_xxx / 企微 userid）
 * @property {string} senderName   - 发送者名称
 * @property {"text"|"image"|"file"|"interactive"} contentType
 * @property {string} textContent  - 纯文本内容（富文本已提取）
 * @property {Object} rawContent   - 原始消息体
 * @property {boolean} isMentioned - Bot 是否被 @
 * @property {number} timestamp    - 毫秒时间戳
 */
```

### 5.3 路由绑定规则 DSL

```json
{
  "bindingId": "feishu-sales-default",
  "enabled": true,
  "channel": "feishu",
  "accountId": "tenant_a",
  "match": {
    "peerType": "group",
    "peerId": "*",
    "senderAllowlist": ["ou_xxx", "ou_yyy"]
  },
  "route": {
    "workspaceSlug": "sales-workspace",
    "agentId": "sales-assistant",
    "sessionScope": "per-channel-peer"
  },
  "security": {
    "requireMention": true,
    "commandPolicy": "deny_all",
    "allowedCommands": [],
    "maxMessageLength": 4000
  },
  "priority": 100
}
```

**路由匹配规则（最具体优先）：**

1. 精确匹配 `peerId` + `senderId` → 优先级最高。
2. 精确匹配 `peerId` + `senderAllowlist: ["*"]` → 次之。
3. 通配 `peerId: "*"` + `senderAllowlist` → 再次。
4. 通配 `peerId: "*"` + 无 allowlist → 默认回退。
5. 同级规则按 `priority` 数值降序排列。

### 5.4 会话映射（SessionManager）

```javascript
/**
 * 渠道 peer 与 Alata workspace_thread 的映射。
 * 数据存储在网关本地 SQLite。
 *
 * 表结构:
 * CREATE TABLE channel_sessions (
 *   id          INTEGER PRIMARY KEY AUTOINCREMENT,
 *   provider    TEXT    NOT NULL,
 *   account_id  TEXT    NOT NULL,
 *   peer_id     TEXT    NOT NULL,
 *   peer_type   TEXT    NOT NULL,
 *   sender_id   TEXT,                 -- per-channel-sender 模式使用
 *   binding_id  TEXT    NOT NULL,
 *   workspace_slug TEXT NOT NULL,
 *   thread_slug TEXT    NOT NULL,     -- Alata thread slug
 *   last_active_at INTEGER NOT NULL,
 *   created_at  INTEGER NOT NULL,
 *   UNIQUE(provider, account_id, peer_id, sender_id)
 * );
 */
class SessionManager {
  /**
   * 获取或创建 Alata thread。
   * @param {StandardMessage} message
   * @param {Binding} binding
   * @param {AlataClient} alataClient
   * @returns {Promise<string>} threadSlug
   */
  async getOrCreateThread(message, binding, alataClient) {
    const sessionKey = this._buildSessionKey(
      message,
      binding.route.sessionScope
    );
    const existing = this.db.get(
      "SELECT thread_slug FROM channel_sessions WHERE provider=? AND account_id=? AND peer_id=? AND sender_id=?",
      sessionKey
    );

    if (existing) {
      this._touchSession(existing.id);
      return existing.thread_slug;
    }

    // 调用 Alata API 创建新线程
    const thread = await alataClient.createThread(binding.route.workspaceSlug, {
      name: `${message.provider}:${message.peerId}`,
    });

    this._insertSession(sessionKey, binding, thread.slug);
    return thread.slug;
  }
}
```

**sessionScope 策略：**

| 策略                  | 键组合                                   | 效果                            |
| --------------------- | ---------------------------------------- | ------------------------------- |
| `per-channel-peer`    | provider + accountId + peerId            | 每个群/每个私聊独立会话（默认） |
| `per-channel-sender`  | provider + accountId + peerId + senderId | 群内每人独立会话                |
| `per-channel-account` | provider + accountId                     | 整个应用共享一个会话            |

### 5.5 AlataClient（API 客户端）

```javascript
/**
 * Alata Studio API 客户端。
 * 封装所有 HTTP 调用，提供类型安全的方法。
 */
class AlataClient {
  constructor({ baseUrl, apiKey, timeout = 30000 }) {
    this.http = axios.create({
      baseURL: baseUrl,
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout,
    });
  }

  /** 创建线程 */
  async createThread(workspaceSlug, { name }) {
    const { data } = await this.http.post(
      `/v1/workspace/${workspaceSlug}/thread/new`,
      { name }
    );
    return data.thread; // { id, name, slug, workspace_id }
  }

  /** 流式对话 — 返回 async iterable */
  async *streamChat(workspaceSlug, threadSlug, message, opts = {}) {
    const response = await this.http.post(
      `/v1/workspace/${workspaceSlug}/thread/${threadSlug}/stream-chat`,
      { message, mode: opts.mode || "chat" },
      { responseType: "stream" }
    );
    // 解析 SSE 流
    for await (const chunk of response.data) {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          yield parsed;
          if (parsed.close) return;
        } catch {
          /* skip non-JSON lines */
        }
      }
    }
  }

  /** 同步对话 */
  async chat(workspaceSlug, threadSlug, message, opts = {}) {
    const { data } = await this.http.post(
      `/v1/workspace/${workspaceSlug}/thread/${threadSlug}/chat`,
      { message, mode: opts.mode || "chat" }
    );
    return data; // { id, type, textResponse, sources, close }
  }

  /** 获取待审批列表 */
  async getPendingConfirmations(workspaceSlug) {
    const { data } = await this.http.get(
      `/api/workspace/${workspaceSlug}/confirmations/pending`
    );
    return data.confirmations;
  }

  /** 审批通过 */
  async approveConfirmation(workspaceSlug, confirmationId, feedback) {
    return this.http.post(
      `/api/workspace/${workspaceSlug}/confirmations/${confirmationId}/approve`,
      { userResponse: feedback }
    );
  }

  /** 健康检查 */
  async healthCheck() {
    const { data } = await this.http.get("/v1/auth");
    return data.authenticated === true;
  }
}
```

### 5.6 异步消息处理队列

```javascript
const fastq = require("fastq");

/**
 * 入站消息异步处理队列。
 * Webhook 立即返回 200，消息入队后由 worker 异步处理。
 */
function createMessageQueue({ concurrency = 5, handler }) {
  const queue = fastq.promise(handler, concurrency);

  queue.error((err, task) => {
    logger.error({ err, messageId: task?.messageId }, "Queue processing error");
  });

  return {
    /** 将消息推入队列 */
    push(standardMessage, binding) {
      return queue.push({ message: standardMessage, binding });
    },
    /** 队列深度 */
    get pending() {
      return queue.length();
    },
    /** 是否空闲 */
    get idle() {
      return queue.idle();
    },
  };
}
```

### 5.7 错误反馈模板

```javascript
const ERROR_TEMPLATES = {
  NO_ROUTE: {
    zh: "暂未配置此对话的 AI 服务，请联系管理员",
    en: "No AI service configured for this conversation",
  },
  PERMISSION_DENIED: {
    zh: "您暂无权限使用此功能",
    en: "You don't have permission for this action",
  },
  COMMAND_BLOCKED: {
    zh: "此命令在当前渠道不可用",
    en: "This command is not available in this channel",
  },
  AGENT_TIMEOUT: {
    zh: "处理超时，请稍后再试",
    en: "Processing timed out, please try again later",
  },
  AGENT_ERROR: {
    zh: "处理过程中遇到问题，请稍后再试",
    en: "An error occurred, please try again later",
  },
  RATE_LIMITED: {
    zh: "消息发送过于频繁，请稍后再试",
    en: "Too many messages, please slow down",
  },
  MESSAGE_TOO_LONG: {
    zh: "消息过长，请精简后重试",
    en: "Message too long, please shorten and retry",
  },
};
```

---

## 6. 完整消息处理流程

### 6.1 主流程（Webhook → Agent → Reply）

```text
飞书/企微 Webhook POST
      │
      ▼
  ① Express 路由: POST /webhook/:provider
      │
      ▼
  ② adapter.verifyWebhook(req)
      │ 失败 → 200 OK（静默）
      ▼
  ③ adapter.parseEvent(req.body)
      │ null → 200 OK（非消息事件，如 URL 验证）
      ▼
  ④ adapter.isDuplicate(event.eventId)
      │ true → 200 OK（幂等）
      ▼
  ⑤ 立即返回 200 OK（不阻塞 webhook）
      │
      ▼
  ⑥ messageQueue.push(standardMessage)
      │
      ▼
  ⑦ [Worker] router.matchBinding(message)
      │ 无匹配 → adapter.sendErrorFeedback(NO_ROUTE)
      ▼
  ⑧ [Worker] security checks
      │ - commandFilter: 是否拦截命令
      │ - rateLimiter: peer 维度限流
      │ - maxMessageLength: 长度校验
      │ 拦截 → adapter.sendErrorFeedback(对应错误)
      ▼
  ⑨ [Worker] sessionManager.getOrCreateThread()
      │ → 调用 Alata API: POST /v1/workspace/:slug/thread/new
      ▼
  ⑩ [Worker] alataClient.streamChat()
      │ → 调用 Alata API: POST /v1/workspace/:slug/thread/:thread/stream-chat
      │ → 收集流式响应块 → 拼接完整回复
      ▼
  ⑪ [Worker] adapter.sendTextReply(peer, fullResponse)
      │ 失败 → 指数退避重试（最多 3 次，间隔 1s/2s/4s）
      ▼
  ⑫ [Worker] auditLogger.record(event)
```

### 6.2 HITL 审批流程

当 Alata Agent 执行触发了需要人工确认的操作（高风险工具调用），流程如下：

```text
Agent 执行中 → 触发 HITL → Alata 暂停并记录 pending confirmation
      │
      ▼
  方案 A（v1 轮询模式）：
  网关定时轮询 GET /api/workspace/:slug/confirmations/pending
      │ 发现新审批 → adapter.sendRichReply(peer, 审批卡片)
      │ 用户在 IM 内交互 → 网关收到回复
      │ → alataClient.approveConfirmation() 或 .rejectConfirmation()
      │ → Alata Agent 继续或终止

  方案 B（v2 推送模式，需 Alata 补 webhook）：
  Alata 主动 POST hitl.webhookUrl → 网关收到推送
      │ → adapter.sendRichReply(peer, 审批卡片)
      │ 后续同上
```

### 6.3 飞书 URL 验证（特殊流程）

飞书配置 webhook 时会发送验证请求：

```text
POST /webhook/feishu
Body: { "challenge": "xxx", "type": "url_verification" }

→ adapter.parseEvent() 返回 null
→ Express 直接返回: { "challenge": "xxx" }
```

### 6.4 企微加密消息解密流程

企微 webhook body 为 XML + AES 加密：

```text
POST /webhook/wecom?msg_signature=xxx&timestamp=xxx&nonce=xxx
Body: <xml><Encrypt>...</Encrypt></xml>

→ adapter.verifyWebhook(): 校验 msg_signature
→ adapter.parseEvent(): AES 解密 → XML 解析 → StandardMessage
```

---

## 7. 数据模型

### 7.1 网关本地数据库（SQLite）

```sql
-- 会话映射
CREATE TABLE channel_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  provider        TEXT    NOT NULL,    -- "feishu" | "wecom"
  account_id      TEXT    NOT NULL,    -- 应用 ID
  peer_id         TEXT    NOT NULL,    -- 群 ID 或用户 ID
  peer_type       TEXT    NOT NULL,    -- "group" | "user"
  sender_id       TEXT    DEFAULT '',  -- per-channel-sender 模式使用
  binding_id      TEXT    NOT NULL,
  workspace_slug  TEXT    NOT NULL,
  thread_slug     TEXT    NOT NULL,    -- 映射的 Alata thread
  last_active_at  INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE(provider, account_id, peer_id, sender_id)
);
CREATE INDEX idx_sessions_lookup ON channel_sessions(provider, account_id, peer_id);

-- 事件去重（仅保留 24 小时）
CREATE TABLE event_dedup (
  event_id    TEXT    PRIMARY KEY,
  provider    TEXT    NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX idx_dedup_expire ON event_dedup(received_at);

-- 审计日志
CREATE TABLE message_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT    NOT NULL,
  event_id    TEXT,
  direction   TEXT    NOT NULL,   -- "inbound" | "outbound"
  binding_id  TEXT,
  peer_id     TEXT,
  sender_id   TEXT,
  workspace_slug TEXT,
  thread_slug TEXT,
  status      TEXT    NOT NULL,   -- "ok" | "error" | "filtered" | "no_route"
  error_type  TEXT,
  latency_ms  INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_events_binding ON message_events(binding_id, created_at);
CREATE INDEX idx_events_peer ON message_events(provider, peer_id, created_at);

-- 路由绑定规则
CREATE TABLE bindings (
  id          TEXT    PRIMARY KEY,  -- bindingId
  enabled     INTEGER NOT NULL DEFAULT 1,
  channel     TEXT    NOT NULL,
  account_id  TEXT    NOT NULL,
  match_json  TEXT    NOT NULL,
  route_json  TEXT    NOT NULL,
  security_json TEXT  NOT NULL,
  priority    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_bindings_match ON bindings(channel, account_id, priority DESC);
```

### 7.2 网关不存储的数据

以下数据全部在 Alata 侧，网关不保存副本：

- 对话历史（workspace_chats）
- 线程详情（workspace_threads）
- Agent 配置
- 知识库 / 向量数据
- 用户信息

---

## 8. 安全设计

### 8.1 Webhook 签名校验

| 渠道 | 校验方式                                                                           |
| ---- | ---------------------------------------------------------------------------------- |
| 飞书 | `SHA256(timestamp + nonce + encrypt_key + body)` 与 header `X-Lark-Signature` 比对 |
| 企微 | `SHA1(sort(token, timestamp, nonce, msg_encrypt))` 与 query `msg_signature` 比对   |

### 8.2 凭据存储

- 渠道 `app_secret`、`encrypt_key`、`aes_key` 使用 `crypto-js` AES 加密后存入环境变量或 `.env` 文件。
- Alata API Key 同样加密存储。
- **严禁明文存储任何凭据。**

### 8.3 命令拦截

```javascript
function shouldBlockCommand(message, binding) {
  const text = message.textContent.trim();
  if (!text.startsWith("/")) return false; // 不是命令

  switch (binding.security.commandPolicy) {
    case "deny_all":
      return true;
    case "allowlist":
      const cmd = text.split(/\s/)[0]; // 提取 /command
      return !binding.security.allowedCommands.includes(cmd);
    case "inherit_workspace":
      return false; // 交给 Alata 侧处理
    default:
      return true; // 安全默认
  }
}
```

### 8.4 速率限制

| 限制器     | 窗口 | 阈值 | 键                          |
| ---------- | ---- | ---- | --------------------------- |
| 每应用入站 | 60s  | 120  | `provider:accountId`        |
| 每 peer    | 60s  | 20   | `provider:accountId:peerId` |
| 并发执行   | —    | 10   | `provider:accountId`        |

---

## 9. 配置参考

### 9.1 环境变量（`.env`）

```bash
# ── Alata 连接 ──
ALATA_BASE_URL=http://localhost:3001
ALATA_API_KEY=ak-xxxxxxxxxxxxxxxx

# ── 飞书 ──
FEISHU_APP_ID=cli_xxxxxx
FEISHU_APP_SECRET=encrypted:xxxxx
FEISHU_VERIFICATION_TOKEN=encrypted:xxxxx
FEISHU_ENCRYPT_KEY=encrypted:xxxxx

# ── 企微 ──
WECOM_CORP_ID=ww_xxxxxx
WECOM_AGENT_ID=1000001
WECOM_SECRET=encrypted:xxxxx
WECOM_TOKEN=encrypted:xxxxx
WECOM_ENCODING_AES_KEY=encrypted:xxxxx

# ── 网关 ──
GATEWAY_PORT=3100
GATEWAY_QUEUE_CONCURRENCY=5
GATEWAY_RETRY_ATTEMPTS=3
GATEWAY_RETRY_BACKOFF_MS=1000
GATEWAY_DEDUP_TTL_MS=86400000
GATEWAY_SESSION_CLEANUP_HOURS=168

# ── 日志 ──
LOG_LEVEL=info
```

### 9.2 Docker Compose（联调环境）

```yaml
version: "3.8"
services:
  alata:
    image: alata-studio:latest
    ports:
      - "3001:3001"
    volumes:
      - alata-data:/app/server/storage
    environment:
      - SERVER_PORT=3001

  im-gateway:
    build: .
    ports:
      - "3100:3100"
    depends_on:
      - alata
    environment:
      - ALATA_BASE_URL=http://alata:3001
      - ALATA_API_KEY=${ALATA_API_KEY}
      - FEISHU_APP_ID=${FEISHU_APP_ID}
      - FEISHU_APP_SECRET=${FEISHU_APP_SECRET}
      - GATEWAY_PORT=3100
    volumes:
      - gateway-data:/app/data

volumes:
  alata-data:
  gateway-data:
```

---

## 10. 测试策略

### 10.1 测试分层

| 层级     | 覆盖范围                                                    | 工具                    |
| -------- | ----------------------------------------------------------- | ----------------------- |
| 单元测试 | 路由匹配、命令拦截、会话键生成、消息解析、去重逻辑          | Jest                    |
| 集成测试 | Webhook → Queue → Router → AlataClient(mock) → Sender(mock) | Jest + supertest + nock |
| 契约测试 | Alata API 响应格式、飞书/企微 webhook payload 格式          | JSON Schema             |
| 端到端   | 真实飞书/企微沙箱 + 真实 Alata 实例                         | 手动 + 脚本             |

### 10.2 Mock 方案

```javascript
// test/mocks/feishuWebhook.js
function createFeishuTextMessage({ text, groupId, senderId }) {
  return {
    schema: "2.0",
    header: {
      event_id: `evt_${Date.now()}`,
      event_type: "im.message.receive_v1",
      create_time: String(Date.now()),
      token: "test-verification-token",
    },
    event: {
      sender: { sender_id: { open_id: senderId || "ou_test001" } },
      message: {
        message_id: `om_${Date.now()}`,
        chat_id: groupId || "oc_test_group",
        chat_type: groupId ? "group" : "p2p",
        content: JSON.stringify({ text }),
        message_type: "text",
      },
    },
  };
}
```

```javascript
// test/integration/feishu.test.js
const nock = require("nock");

describe("Feishu webhook → Alata chat", () => {
  beforeEach(() => {
    // Mock Alata thread creation
    nock("http://localhost:3001")
      .post("/v1/workspace/sales/thread/new")
      .reply(200, { thread: { slug: "thread-001" }, message: null });

    // Mock Alata chat
    nock("http://localhost:3001")
      .post("/v1/workspace/sales/thread/thread-001/chat")
      .reply(200, {
        id: "chat-001",
        type: "textResponse",
        textResponse: "This is the agent response",
        sources: [],
        close: true,
      });
  });

  it("routes feishu message to correct workspace", async () => {
    const res = await request(app)
      .post("/webhook/feishu")
      .send(createFeishuTextMessage({ text: "Hello", groupId: "oc_sales" }));
    expect(res.status).toBe(200);
    // ... assert outbound send was called
  });
});
```

---

## 11. 分阶段实施计划

| Phase                  | 周期 | 内容                                                                                            | 交付物               |
| ---------------------- | ---- | ----------------------------------------------------------------------------------------------- | -------------------- |
| **P0: Alata API 补全** | 1 周 | 取消注释 flow execution 端点；新增 HITL webhook 回调；新增 agent invoke REST 端点               | 3 个 API 端点 + 测试 |
| **P1: 网关骨架**       | 2 周 | Express + ChannelAdapter 接口 + AlataClient + MessageQueue + SessionManager + SQLite + 路由引擎 | 可运行但无真实渠道   |
| **P2: 飞书适配器**     | 2 周 | FeishuAdapter 实现 + webhook 签名校验 + 消息解析 + token 管理 + 出站发送 + 端到端联调           | 飞书完整闭环         |
| **P3: 企微适配器**     | 2 周 | WeComAdapter 实现 + XML/AES 解密 + 消息解析 + 出站发送 + 端到端联调                             | 企微完整闭环         |
| **P4: 安全与生产化**   | 2 周 | 命令拦截、速率限制、错误反馈、审计日志完善、监控告警、Dockerfile + compose                      | 生产可部署           |
| **P5: 管理 API**       | 1 周 | 绑定规则 CRUD API、会话管理 API、健康检查端点、运维文档                                         | 管理后台可用         |

**总周期：~10 周**

### 里程碑依赖图

```text
W0 ─── P0 (Alata API) ──┐
                          ├── P1 (骨架) ── P2 (飞书) ── P3 (企微) ── P4 (安全) ── P5 (管理)
测试租户准备 ─────────────┘
```

**关键路径**：P0 + 测试租户准备 是硬性前置条件，必须在 W0 完成。

---

## 12. 风险与缓解

| 风险                                          | 影响 | 概率 | 缓解                                            |
| --------------------------------------------- | ---- | ---- | ----------------------------------------------- |
| Alata API 变更导致网关中断                    | 高   | 低   | AlataClient 封装层 + 契约测试持续监控           |
| Alata 实例不可用                              | 高   | 低   | 断路器模式（连续 N 次失败后短路）+ 友好错误反馈 |
| 网络延迟叠加导致 webhook 处理过慢             | 中   | 低   | 已有异步队列架构，webhook 立即返回              |
| 飞书/企微平台 API 变更                        | 中   | 中   | 适配器版本锁定 + 契约测试 + 告警                |
| Token 刷新失败                                | 高   | 中   | 提前刷新（过期前 10 分钟）+ 重试 + 告警         |
| 队列积压（突发流量）                          | 中   | 中   | 背压监控 + 动态调整 concurrency + 告警          |
| 会话映射不一致（网关 SQLite vs Alata thread） | 中   | 低   | 网关仅存映射，不存业务数据；映射错误可重建      |
| 测试租户/回调域名未按时就绪                   | 高   | 中   | 列为 W0 硬性里程碑                              |

---

## 13. 与内嵌方案对比总结

| 维度         | 内嵌方案（v2 文档） | 独立项目（本文档）   |
| ------------ | ------------------- | -------------------- |
| Alata 改动量 | 10+ 文件、5000+ 行  | 3 个 API、~200 行    |
| 新代码量     | 散布在现有代码中    | ~2500 行集中独立     |
| 总周期       | 13 周               | 10 周                |
| 部署         | 单体                | 双容器（可独立扩缩） |
| 故障域       | 共享                | 隔离                 |
| 团队要求     | 需深入 Alata 全栈   | 仅需熟悉 API         |
| 可复用       | 绑定单实例          | 可对接多 Alata 实例  |
| 技术栈       | Node.js only        | 任意                 |
| 回滚代价     | 需回滚多文件改动    | 停掉网关容器即可     |

---

## 14. 后续迭代方向（Out of Scope for v1）

- **v1.1**：Redis 替换进程内队列（水平扩展）。
- **v1.2**：DingTalk 适配器。
- **v1.3**：富媒体消息支持（图片、文件、卡片模板）。
- **v2.0**：管理后台 UI（绑定规则配置、会话监控、审计日志查看）。
- **v2.1**：渠道适配器热加载（不重启添加新渠道）。
- **v2.2**：WebSocket 长连接推送（飞书已实现）。
