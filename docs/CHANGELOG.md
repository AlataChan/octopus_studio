# Alata Studio 更新日志

> 基于 AnythingLLM (MIT) 的企业级 AI 工作台增强版本

---

## Unreleased

### 安全兼容性提示

- SQL Agent 默认只允许单条 `SELECT`，自动应用行数上限与语句超时；原本通过 SQL Agent 执行 `INSERT` / `UPDATE` / `DELETE` 的部署需要同时配置 `SQL_AGENT_WRITE_ENABLED=true` 与工具级 `allowWrites=true`。`DROP` / `ALTER` / `TRUNCATE` 始终禁止。
- 生产模式现在要求显式设置 `CORS_ALLOWED_ORIGINS`。请配置逗号分隔的前端来源，或明确设置 `CORS_ALLOWED_ORIGINS=*` 继续允许所有来源；公开嵌入聊天与会话历史接口保持客户站点可访问，但不允许 credentialed CORS，并继续依赖嵌入允许域名与会话密钥限制访问。

## [V1.9.2] - 2026-03-21

### 🔌 IM Gateway 与 OpenClaw 完成度补齐

#### IM Gateway 管理增强
- **配置快照接口**：新增管理员接口 `/im-gateway/runtimes/:id/config-admin`
  - 返回 Runtime 下发配置快照、账号/绑定聚合结果与 revision 信息
- **后台配置同步面板**：`/settings/im-gateway` 新增 Config Snapshot 面板
  - 支持按 Runtime 查看 Provider、Account、Binding 与同步内容
- **前端模型补充**：`frontend/src/models/imGateway.js` 新增 `runtimeConfig(id)` 调用

#### OpenClaw Gateway 管理页
- **后端管理服务**：新增 `server/utils/openClaw/`
  - 环境检查：Node.js / Git 检测与下载链接
  - 进程管理：状态检查、启动、停止、重启、端口占用识别
  - 配置同步：写入 LLM Provider / Model / API Key / API Base
  - Dashboard：返回本地控制台访问地址
- **管理接口**：新增 `server/endpoints/openClaw.js`
  - 提供 `/openclaw/install/check`、`/openclaw/status`、`/openclaw/gateway/*`、`/openclaw/config/sync` 等管理员接口
- **前端页面**：新增 `/openclaw` 管理页与导航入口
  - 支持轮询状态、启停操作、环境预检查与 Dashboard 跳转

#### 稳定性与安全性修正
- **退出清理**：主服务退出时清理受管 Gateway 子进程，补上信号处理逻辑
- **端口保护**：识别“端口已被其他进程占用”场景，避免误判为 Gateway 已启动
- **配置权限**：`~/.openclaw/openclaw.alata.json` 及目录权限收紧并补齐旧文件权限修复

#### 测试补充
- **服务端**：新增 IM Gateway service 集成测试与 OpenClaw 后端测试
- **前端**：补充 `imGateway` 新接口测试与 `openClaw` 前端模型测试

## [V1.9.1] - 2025-12-31

### 🕸️ 知识图谱增强功能

#### Feature Flags 与风控机制
- **能力开关**：所有图谱增强能力均可独立开关（`kg_*` 配置项）
  - `kg_guided_retrieval_enabled`：图谱引导检索（兜底式二阶段增强）
  - `kg_entity_extraction_enabled`：实体抽取（默认关闭）
  - `kg_similarity_edges_enabled`：结构相似边计算
  - `kg_path_finder_enabled`：多跳路径查找（默认关闭）
- **性能保护**：
  - 搜索超时阈值（`kg_search_timeout_ms`）
  - 熔断器阈值（`kg_circuit_breaker_threshold`）
  - 写入节流与批次大小限制
- **后台管理页**：`/settings/knowledge-graph`（仅管理员）
  - 开关各项增强能力
  - 查看与重置熔断器状态

#### 图谱引导检索（Graph-Guided Retrieval）
- **兜底式二阶段增强**：图谱检索失败时自动回退到普通向量检索
- **文件位置**：`server/utils/chats/graphGuidedRetrieval.js`

#### 结构相似边计算
- **共现相似**：基于共标签、共引用、共助手计算文档间相似边
- **边数限制**：避免图谱规模膨胀
- **文件位置**：`server/utils/graphBuilder/structuralSimilarity.js`

#### 实体抽取（默认关闭）
- **LLM 辅助抽取**：从文档内容中抽取概念实体
- **成本控制**：异步批处理、配额限制
- **文件位置**：`server/utils/graphBuilder/entityExtractor.js`

#### 路径查找（默认关闭）
- **多跳路径查询**：查找节点间的关联路径
- **适用场景**：Admin/Debug 或可视化增强
- **文件位置**：`server/utils/graphBuilder/pathFinder.js`

### 🎨 首页 AI 员工轮播优化

#### 轮播组件重构
- **布局调整**：从 3D 旋转改为水平轮播（并排显示 3 张卡片）
- **图片预加载**：组件挂载时预加载所有头像，避免加载闪烁
- **自动轮播**：每 4 秒自动切换，鼠标悬停暂停
- **选中记忆**：localStorage 记住上次选择的员工

#### 样式细节优化
- 密码弹窗样式优化
- 全局样式微调

### 🤖 Agent 模块增强

#### 调试与可视化
- **Agent 调试面板**：`AgentDebugPanel` 组件
- **工具执行可视化**：`ToolExecutionCard` 展示工具调用过程
- **调试追踪器**：`server/utils/agents/debugTracer.js`

#### 编排器优化
- **Blackboard 机制增强**：多步骤间上下文共享优化
- **知识缓存**：`knowledgeCache.js` 提升检索性能
- **知识感知**：`knowledgeSensing.js` 增强覆盖度评估

#### 评估框架（新增）
- **QA 评估器**：`server/utils/evaluation/scenarios/qaEvaluator.js`
- **报告评估器**：`server/utils/evaluation/scenarios/reportEvaluator.js`
- **审核评估器**：`server/utils/evaluation/scenarios/reviewEvaluator.js`
- **黄金集管理**：`server/utils/evaluation/goldenSet.js`

### 📁 新增/修改文件

**图谱增强**（`server/utils/graphBuilder/`）：
- `featureFlags.js` - Feature Flags 管理
- `structuralSimilarity.js` - 结构相似边计算
- `entityExtractor.js` - 实体抽取器
- `pathFinder.js` - 路径查找器

**前端**：
- `frontend/src/pages/Admin/KnowledgeGraph/index.jsx` - 知识图谱设置页
- `frontend/src/components/Carousel3D/` - 轮播组件重构
- `frontend/src/components/WorkspaceChat/ChatContainer/AgentDebugPanel/` - 调试面板
- `frontend/src/components/WorkspaceChat/ChatContainer/ToolExecution/` - 工具执行可视化

**后端**：
- `server/utils/chats/graphGuidedRetrieval.js` - 图谱引导检索
- `server/utils/agents/debugTracer.js` - 调试追踪器
- `server/utils/evaluation/` - 评估框架目录
- `server/scripts/rollback-graph-data.js` - 图谱数据回滚脚本

### 📝 文档更新

- `docs/KNOWLEDGE_GRAPH_ENHANCEMENT_PLAN.md` - 知识图谱增强方案（含外部审查意见）
- 更新 PRD、SYSTEM_ARCHITECTURE、TECH_STACK、USER_MANUAL、README

---

## [V1.9] - 2025-12-17

### 🕸️ 知识图谱构建与可视化

- 新增图谱构建任务表 `workspace_graph_builds`（含 Prisma 迁移）
- 新增 Workspace 知识图谱 API：查询/搜索/触发构建/状态轮询
- 新增 `WorkspaceGraphBuilder` 异步构建器：扫描文档、聊天、Episode，并生成协作关系边
- 新增前后端测试覆盖知识图谱接口/模型

### 🤖 模板与编排

- 新增 Assistant 模板文档（数据分析、法律顾问、市场分析）
- 新增 Agent Flow 插件：长文写作编排、市场调研编排

### 🎨 体验优化

- 文档管理器：`已缓存` 标签右侧与删除按钮并排显示

### 📝 文档更新

- PRD 与 L2/L3 自主级别评估更新

---

## [V1.8] - 2025-12-09

### 🧠 记忆系统全面升级

基于 `memory-system-review-and-recommendations.md` 完成 Phase 0-2 全部任务（18.5 天工作量），实现三层记忆架构。

#### Phase 0: 接好管道（2.5天）
- **对话摘要注入**：`contextEnhancer.js` 将 `ConversationSummarizer` 生成的摘要注入 LLM 上下文
- **统一图谱检索**：提取 `getGraphContextForChat()` 公共函数，扩展到 `apiChatHandler.js` 和 `embed.js`
- **历史容量提升**：默认历史条数从 20 提升到 40，支持 Workspace 级配置
- **混合检索引擎**：`hybridRetrieval.js` 实现 2 因子公式（相似度 70% + 时间衰减 30%）

#### Phase 1: 小步增强（6天）
- **Episode 管理**：`episodeManager.js` - 项目/任务作为 Graph Node 存储
- **用户偏好**：`userPreferences.js` - 3 字段极简偏好（language/explanation_depth/code_style）
- **记住按钮**：`RememberButton.jsx` + `manualMemory.js` - 用户主动触发记忆保存
- **记忆健康度**：`memoryStats.js` API + `MemoryStatsPanel.jsx` 管理面板

#### Phase 2: 验证后扩展（10天）
- **工作记忆**：`workingMemory.js` - 用 `thread.metadata` 存储活跃话题/待办任务/关键决策
- **Episode 自动检测**：`episodeDetector.js` - 轻量级 LLM 分析对话归属 + 建议 UI
- **PII 过滤**：`piiFilter.js` - 敏感信息检测（API Key/密码/邮箱/手机/身份证等）+ 脱敏确认流程

### 📁 新增文件

**后端记忆模块**（`server/utils/memory/`）：
- `workingMemory.js` - 工作记忆管理器
- `episodeDetector.js` - Episode 自动检测器
- `episodeManager.js` - Episode 管理器
- `piiFilter.js` - PII 过滤器
- `manualMemory.js` - 手动记忆管理
- `memoryStats.js` - 记忆统计
- `userPreferences.js` - 用户偏好

**后端聊天增强**（`server/utils/chats/`）：
- `contextEnhancer.js` - 上下文增强器（摘要 + 图谱 + 工作记忆）
- `hybridRetrieval.js` - 混合检索引擎
- `config.js` - 聊天配置（历史容量等）

**后端 API**（`server/endpoints/api/`）：
- `episodes.js` - Episode 管理 API
- `memories.js` - 记忆保存 API（含 PII 检测）
- `memoryStats.js` - 记忆统计 API
- `userPreferences.js` - 用户偏好 API
- `workingMemory.js` - 工作记忆 API

**前端 API 模型**（`frontend/src/models/`）：
- `episode.js` - Episode API 封装
- `memory.js` - 记忆 API 封装
- `memoryStats.js` - 记忆统计 API 封装
- `userPreferences.js` - 用户偏好 API 封装

**前端页面组件**：
- `frontend/src/pages/WorkspaceSettings/Episodes/` - Episode 管理页面
- `frontend/src/pages/Admin/AISystem/MemoryStatsPanel.jsx` - 记忆健康度面板
- `frontend/src/pages/GeneralSettings/Settings/components/AIPreferences.jsx` - AI 偏好设置
- `frontend/src/components/WorkspaceChat/.../RememberButton.jsx` - 记住按钮
- `frontend/src/components/WorkspaceChat/EpisodeSuggestion/` - Episode 建议组件

### 📝 修改文件

- `server/utils/chats/stream.js` - 集成 contextEnhancer
- `server/utils/chats/apiChatHandler.js` - 添加图谱检索
- `server/utils/chats/embed.js` - 添加图谱检索
- `server/models/workspaceChats.js` - 集成工作记忆和 Episode 检测
- `server/models/workspaceGraph.js` - Episode 节点类型支持
- `frontend/src/pages/WorkspaceSettings/index.jsx` - 添加 Episodes Tab
- `frontend/src/pages/GeneralSettings/Settings/Interface/index.jsx` - 添加 AI 偏好设置
- `frontend/src/components/.../Actions/index.jsx` - 添加记住按钮
- `frontend/src/pages/Admin/AISystem/index.jsx` - 添加记忆监控面板

### 🔧 技术亮点

- **零新表设计**：复用 `workspace_graph_nodes`、`user.metadata`、`thread.metadata` 等现有结构
- **混合检索公式**：`finalScore = similarity × 0.7 + exp(-days/30) × 0.3`
- **PII 检测模式**：8 种敏感信息类型的正则匹配 + 可选脱敏
- **工作记忆结构**：`{ active_topics, pending_tasks, key_decisions }` 存储在 thread.metadata

---

## [V1.7] - 2025-12-07

### 🔄 Flow 执行进度指示器

#### 实时进度显示（新增）
- **FlowProgress 组件**：在 Flow 执行时显示轻量进度指示器
- **核心信息展示**：
  - Flow 名称
  - 步骤进度（X/Y 格式）
  - 可视化进度条
  - 当前步骤动作描述
- **自动清理**：执行完成后自动移除进度指示器

### 🧠 Platform 模式知识交互系统

#### P0: 对话摘要留存（新增）
- **ConversationSummarizer 模块**：`server/utils/memory/conversationSummarizer.js`
- **自动摘要**：每 10 条消息触发增量摘要更新
- **存储位置**：`workspace_threads.metadata.summary`
- **用途**：为外部平台提供对话背景上下文

#### P1: 外部响应元数据捕获（新增）
- **PlatformResponseCapture 模块**：`server/utils/memory/platformResponseCapture.js`
- **捕获内容**：
  - 会话 ID（session_id）
  - Token 消耗（tokens_used）
  - 响应延迟（latency_ms）
  - 引用来源（references）
- **平台支持**：Dify、RAGFlow、n8n

#### P2: 用户反馈闭环（新增）
- **FeedbackCollector 模块**：`server/utils/memory/feedbackCollector.js`
- **前端增强**：聊天消息添加 👎 按钮（与 👍 并列）
- **API 端点**：`POST /api/v1/workspace/:slug/chat/:chatId/feedback`
- **数据流**：反馈自动记录到 agent_experience_memory 表

#### P3: 经验记忆（平台表现）（新增）
- **ExperienceMemory 模块**：`server/utils/memory/experienceMemory.js`
- **分析功能**：
  - 按任务类型统计满意率
  - 识别最佳/最差表现任务
  - 跨平台性能对比
- **API 端点**：
  - `GET /api/v1/admin/analytics/platform/:platform`
  - `GET /api/v1/admin/analytics/platforms`

### 🗄️ 数据库变更

- `workspace_threads` 添加 `metadata` 字段（用于存储对话摘要）
- 新增 `user_preferences` 表（用户偏好存储）
- 新增 `agent_experience_memory` 表（经验记忆与反馈追踪）

### 🐛 Bug 修复

- 修复 Dify `agent_log` 事件类型未处理导致的警告日志
- 增强聊天反馈 API，同时记录到经验记忆

### 📁 新增/修改文件

**前端：**
- `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/FlowProgress/index.jsx`（新建）
- `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/HistoricalMessage/Actions/index.jsx`（增强）
- `frontend/src/utils/chat/agent.js`（flowProgress 事件处理）

**后端：**
- `server/utils/memory/index.js`（新建 - 统一导出）
- `server/utils/memory/conversationSummarizer.js`（新建）
- `server/utils/memory/platformResponseCapture.js`（新建）
- `server/utils/memory/feedbackCollector.js`（新建）
- `server/utils/memory/experienceMemory.js`（新建）
- `server/endpoints/feedback.js`（新建 - 反馈与分析 API）
- `server/utils/agentFlows/executor.js`（增强 - 进度通知）

**文档：**
- `docs/knowledge-driven-orchestration.md`（更新 - Platform 模式设计章节）

---

## [V1.6] - 2025-12-06

### 🏠 首页重构：AI 团队中枢

#### 顶部 AI 团队概览条（新增）
- **TeamSummary 组件**：新增首页顶部概览条
- **核心指标展示**：
  - 平均响应时间（基于 workspace_agent_invocations 计算）
  - 本周完成任务数（过去 7 天 success=true 的调用数）
- **主 CTA 按钮**：「开始一个任务 →」快速进入聊天

#### AI 员工卡片选择器（重构）
- **卡片化设计**：从圆形头像改为横向滑动卡片
- **信息展示优化**：
  - 员工头像（支持 avatarUrl 图片 + icon emoji + 默认图标三级降级）
  - 员工姓名（优先 employeeName）
  - 职位/简介（优先 employeeTitle）
- **交互增强**：
  - CSS scroll-snap 吸附滚动
  - 左右导航箭头（hover 显示）
  - 选中状态高亮（蓝色边框 + 阴影）
- **记忆功能**：localStorage 记住上次选择的助手

#### 配置向导优化（改造 Checklist）
- **位置调整**：从独立区域移到右侧栏
- **折叠逻辑**：全部完成后自动折叠为一行提示
- **自适应布局**：Checklist 隐藏后，QuickLinks 自动扩展为全宽

#### 进阶功能区简化（重构 ExploreFeatures）
- **从 3 个大卡片 → 3 个小卡片**
- **功能精简**：
  - 🛠️ 创建员工技能（Agent Flow Builder）
  - ⚡ 创建快捷命令（斜杠命令）
  - 👤 设置员工人设（系统提示）
- **移除无效链接**：删除跳转到 AnythingLLM 社区的"在中心探索"按钮
- **术语优化**："系统提示" → "员工人设"（更贴合 AI 员工概念）

### 📁 新增/修改文件

**前端：**
- `frontend/src/pages/Main/Home/TeamSummary/index.jsx`（新建）
- `frontend/src/pages/Main/Home/index.jsx`（布局重构）
- `frontend/src/pages/Main/Home/QuickLinks/index.jsx`（卡片选择器）
- `frontend/src/pages/Main/Home/Checklist/index.jsx`（折叠逻辑）
- `frontend/src/pages/Main/Home/ExploreFeatures/index.jsx`（小卡片重构）

**后端：**
- `server/utils/performanceStats.js`（新增 avgResponseTimeMs、completedThisWeek）

**文档：**
- `docs/home-redesign-v2.md`（首页改版设计方案）
- `docs/ai-employee-evolution.md`（AI 员工进化设计蓝图）

---

## [V1.5.1] - 2025-12-03

### 📚 API 文档与自助服务

#### Swagger/OpenAPI 文档
- **文档生成**：使用 swagger-autogen 自动生成 OpenAPI 3.0.0 规范文档
- **API 分组**：
  - Billing API：钱包、使用量、统计、定价查询
  - API Keys API：密钥管理 CRUD 操作
  - Notifications API：通知列表、已读状态管理
- **访问路径**：`/api/docs` 查看 Swagger UI

#### 三级模型定价体系
- **定价分组**：
  - `premium`（高端推理）：¥0.20/1K 输入，¥1.00/1K 输出
  - `international`（国际标准）：¥0.10/1K 输入，¥0.50/1K 输出
  - `domestic`（国内高性价比）：¥0.005/1K 输入，¥0.01/1K 输出
- **模型映射**：30+ 模型自动归类
  - Premium：Claude Opus/Sonnet、GPT-4.5、o1/o3 系列
  - International：GPT-4o、Claude Haiku、Gemini Pro
  - Domestic：DeepSeek、Qwen、GLM、Moonshot 等

#### 用户自助查询页面
- **路由**：`/settings/my-billing`
- **功能模块**：
  - 钱包概览：余额、累计消耗、累计充值
  - 使用统计：按模型组统计、Token 消耗明细
  - 使用记录：分页列表、筛选（模型组/日期）
  - 充值记录：历史充值明细
  - 定价说明：各模型组定价、支持的模型列表

#### 用户自助 API
- `GET /user/billing/wallet`：查询钱包余额
- `GET /user/billing/usage`：查询使用记录（分页）
- `GET /user/billing/stats`：查询使用统计
- `GET /user/billing/trend`：查询日趋势数据
- `GET /user/billing/model-ranking`：查询模型使用排行
- `GET /user/billing/topups`：查询充值记录
- `GET /user/billing/pricing`：查询定价信息

---

## [V1.5] - 2025-12-03

### 💰 企业计费系统

#### API Key 管理模块
- **数据模型扩展**：`api_keys` 表新增字段
  - `name`：API Key 名称/描述
  - `isActive`：启用/禁用状态
  - `expiresAt`：过期时间
  - `rateLimit`：速率限制（请求/分钟）
  - `lastUsedAt`：最后使用时间
  - `usageCount`：总使用次数
  - `permissions`：权限配置（JSON）

- **后端 API**：
  - `GET /api/user/api-keys`：获取当前用户的 API Keys
  - `POST /api/user/api-keys`：创建新 API Key（支持名称、有效期、速率限制）
  - `PATCH /api/user/api-keys/:id`：更新 API Key 属性
  - `POST /api/user/api-keys/:id/regenerate`：重新生成密钥
  - `DELETE /api/user/api-keys/:id`：删除 API Key

- **中间件增强**：`validApiKey` 中间件支持
  - 检查 `isActive` 状态
  - 检查 `expiresAt` 过期时间
  - 自动更新使用统计（usageCount、lastUsedAt）

- **前端界面**：
  - NewApiKeyModal 支持设置名称、有效期（永不过期/30天/90天/180天/1年）、速率限制
  - ApiKeyRow 显示状态标签（活跃/已禁用/已过期）、使用次数、最后使用时间
  - 表格新增列：名称/密钥、状态、使用次数

#### 预算告警通知系统
- **通知服务**（`server/utils/billing/alertService.js`）：
  - 余额不足告警（低于阈值时触发）
  - 预算超支告警（Workspace 预算消耗完毕）
  - 支持配置告警阈值

- **通知中心**：
  - `GET /api/notifications`：获取通知列表
  - `GET /api/notifications/unread-count`：获取未读数量
  - `PATCH /api/notifications/:id/read`：标记为已读
  - `POST /api/notifications/mark-all-read`：全部标记已读

- **前端组件**：
  - NotificationBell 通知铃铛（显示未读数量角标）
  - 通知下拉面板（点击铃铛展开）
  - 集成到用户卡片区域

#### 计费配置管理
- **计费服务**（`server/utils/billing/billingService.js`）：
  - Token 计费计算
  - 模型组定价配置
  - 使用量统计与扣费

- **数据模型**：
  - `user_wallets`：用户钱包（余额、累计消费）
  - `wallet_topups`：充值记录
  - `workspace_budgets`：Workspace 预算配置
  - `usage_logs`：使用日志（Token 消耗明细）
  - `notifications`：通知记录

- **管理 API**：
  - `GET /api/admin/billing/config`：获取计费配置
  - `PATCH /api/admin/billing/config`：更新计费配置
  - `GET /api/admin/billing/wallets`：获取所有用户钱包
  - `POST /api/admin/billing/wallets/:userId/topup`：管理员充值

### 🌍 品牌本地化

#### 中文翻译更新
- 将界面中的 "AnythingLLM" 替换为 "Alata Studio"
  - API 密钥页面描述
  - 隐私设置描述
  - 文档监控说明
  - 聊天助手名称
- 保留"基于 AnythingLLM"致谢说明

### 📁 新增文件

**后端：**
- `server/endpoints/apiKeys.js` - 用户级 API Key 管理端点
- `server/endpoints/notifications.js` - 通知系统端点
- `server/endpoints/billing.js` - 计费管理端点
- `server/models/notification.js` - 通知数据模型
- `server/models/billing/` - 计费相关数据模型
  - `index.js`、`userWallet.js`、`walletTopup.js`、`workspaceBudget.js`、`usageLog.js`
- `server/utils/billing/` - 计费服务
  - `index.js`、`billingService.js`、`alertService.js`
- `server/prisma/migrations/20251203092207_add_billing_system/` - 数据库迁移

**前端：**
- `frontend/src/models/apiKey.js` - API Key 管理 API 封装
- `frontend/src/models/notification.js` - 通知 API 封装
- `frontend/src/models/billing.js` - 计费 API 封装
- `frontend/src/components/Notifications/` - 通知组件
  - `index.jsx`、`NotificationBell.jsx`
- `frontend/src/pages/Admin/Billing/` - 计费管理页面
  - `index.jsx`、`WalletRow.jsx`、`TopupModal.jsx`

### 📝 修改文件

**后端：**
- `server/prisma/schema.prisma` - 新增计费相关表结构
- `server/models/apiKeys.js` - 扩展 validate、update、getByUser、regenerate 方法
- `server/utils/middleware/validApiKey.js` - 增强验证逻辑
- `server/endpoints/admin.js` - generate-api-key 支持新参数
- `server/endpoints/system.js` - generate-api-key 支持新参数
- `server/index.js` - 注册新端点

**前端：**
- `frontend/src/models/admin.js` - generateApiKey 支持 options 参数
- `frontend/src/models/system.js` - generateApiKey 支持 options 参数
- `frontend/src/pages/GeneralSettings/ApiKeys/index.jsx` - 更新表格列
- `frontend/src/pages/GeneralSettings/ApiKeys/ApiKeyRow/index.jsx` - 显示新字段
- `frontend/src/pages/GeneralSettings/ApiKeys/NewApiKeyModal/index.jsx` - 新增配置选项
- `frontend/src/components/Sidebar/UserCard/index.jsx` - 集成通知铃铛
- `frontend/src/locales/zh/common.js` - 品牌名称更新

---

## [M4.1] - 2025-12-02

### 🚀 AI 员工库扩展与能力增强

#### AI 员工预设模板扩展
- **数量提升**：从 9 个扩展到 **20 个** 预设模板
- **分类体系**：
  - 🏢 **通用基础**（8 个）：内部政策顾问、知识萃取专家、SOP 流程撰写官、商业分析报告生成器、商务邮件专家、会议纪要专家、合同审核顾问、数据分析师
  - 🌍 **跨境电商**（4 个）：多语言 Listing 专家、Review 回复专家、市场情报员、平台合规顾问
  - 📱 **自媒体**（4 个）：爆款标题专家、热点追踪员、内容拆解专家、脚本撰写官
  - 🏭 **制造业**（4 个）：供应商评估师、质量异常分析员、技术文档翻译官、设备维护顾问

#### Skills 系统集成
- **Skills 字段支持**：AI 员工模板新增 `defaultSkills` 配置
- **内置 Skills**：
  - `builtin:document-search`：文档搜索与深度研究
  - `builtin:database-query`：数据库查询与探索
- **工具展开**：Skills 中定义的工具自动注入到 Agent 执行环境

#### MCP 服务器按员工配置
- **独立配置**：每个 AI 员工可配置专属的 MCP 服务器列表
- **过滤机制**：实现 `filterMCPServersByConfig()` 函数
- **灵活合并**：支持 Skills 中定义的 MCP 服务器与员工配置合并

#### Command 机制
- **CommandRegistry**：统一的命令注册与查询系统
- **Slash 命令**：支持 `/query-db`、`/explore-db`、`/search`、`/research` 等命令
- **API 端点**：新增 `GET /v1/commands` 获取可用命令列表

#### 数据中台连接器（doris-data-platform）
- **新增 Tool**：`doris-data-platform` 连接企业数据中台
- **核心功能**：
  - `natural_query`：自然语言查询（Text-to-SQL）
  - `list_tables`：列出数据表
  - `table_schema`：获取表结构
  - `health`：健康检查
- **整合说明**：基于 doris-sga 项目（Vanna.AI + Apache Doris）
- **配置方式**：环境变量 `DORIS_API_URL` 指向数据中台服务

### 🎨 UI/UX 优化

#### 卡片布局优化
- **响应式网格**：AI 员工卡片从一行 3 个优化为一行 4 个
- **断点支持**：`lg:grid-cols-3 xl:grid-cols-4`
- **影响页面**：助手库主页、创建向导模板选择器

### 📁 新增文件
- `server/utils/agents/aibitat/plugins/doris-data-platform.js`
- `server/utils/commands/CommandRegistry.js`
- `server/utils/commands/constants.js`
- `server/utils/commands/index.js`

### 📝 修改文件
- `server/data/presetTemplates.js` - 扩展至 20 个模板
- `server/utils/agents/aibitat/plugins/index.js` - 注册新 Tool
- `server/utils/agents/defaults.js` - Skills/MCP 处理函数
- `server/utils/agents/index.js` - 加载 Skills 配置
- `server/endpoints/api/system/index.js` - Commands API
- `frontend/src/pages/AssistantLibrary/index.jsx` - 网格布局
- `frontend/src/pages/AssistantLibrary/CreateAssistant/components/PresetTemplateSelector.jsx` - 网格布局

---

## [M3.8] - 2025-01-20

### 🎨 UI/UX 优化

#### 聊天界面布局重构
- **输入框固定在底部**：解决输入框被推出屏幕的问题
  - 重构 ChatContainer 为 Flexbox 布局
  - 分离固定区域（顶部助手选择器、底部输入框）和可滚动区域（中间聊天历史）
  - 调整 ChatHistory 底部内边距从 192px 减少到 16px
  - 修改垂直对齐方式从 `justify-end` 改为 `justify-center`
  - 修改文件：
    - `frontend/src/components/WorkspaceChat/ChatContainer/index.jsx`
    - `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/index.jsx`

#### 用户体验提升
- ✅ 输入框始终可见在屏幕底部，无需滚动
- ✅ 欢迎文字在中间区域垂直居中显示
- ✅ 助手选择器固定在顶部
- ✅ 所有底部按钮（📎 ✏️ @ T 🎤）完全可见
- ✅ 响应式设计正常工作（移动端和桌面端）

### 📝 文档更新
- 更新 `docs/INTERACTION_OPTIMIZATION_SUMMARY.md`：添加聊天界面布局优化详细说明

---

## [M3.7] - 2025-01-17

### 🎨 UI/UX 增强

#### 品牌化改造
- **Logo 替换**：将 AnythingLLM logo 替换为 Alata Studio logo
  - 三角形节点网络图标 + "ALATA STUDIO" 文字
  - 支持深色/浅色主题自动切换
  - 优化尺寸和布局（280x50px，单行布局）
  - 文件位置：`frontend/src/media/logo/alata-studio-*.svg`

#### 侧边栏快速访问
- **已雇佣助手列表**：在侧边栏显示所有已雇佣的助手
  - 支持折叠/展开，默认展开
  - 显示助手图标、名称和所属标签
  - 点击助手直接跳转到聊天页面并自动选中
  - 减少操作步骤，提升使用效率
  - 组件位置：`frontend/src/components/Sidebar/HiredAssistants/`

#### 聊天页面增强
- **URL 参数支持**：支持通过 URL 参数 `?assistantId=xxx` 自动选中助手
- **自动跳转**：从侧边栏点击助手后自动跳转并选中
- **参数清理**：跳转后自动清除 URL 参数，避免刷新后重复设置

### 📝 文档更新
- 新增 `docs/M3_UI_ENHANCEMENT_SUMMARY.md`：详细记录 UI 增强实现
- 更新 `docs/PRD.md`：添加侧边栏快速访问功能说明
- 更新 `docs/SYSTEM_ARCHITECTURE.md`：更新前端架构图
- 更新 `README.md`：添加 Alata Studio 企业特性说明

---

## [M3.6] - 2025-01-15

### 🤖 多 Agent 编排完成

#### 后端实现
- **Subflow 支持**：Agent Flow 支持调用子流程
- **Blackboard 机制**：多步骤间共享上下文
- **角色元数据**：消息中记录执行角色信息

#### 前端实现
- **角色标签显示**：在聊天消息旁显示执行角色
- **助手详情页**：展示内部角色列表

#### 示例助手
- 长文写作助手（研究 + 写作 + 审校）
- 市场调研助手（信息检索 + 分析 + 报告）

---

## [M3.1-M3.5] - 2025-01-10 至 2025-01-14

### 📚 助手库核心功能

#### 数据模型
- 新增 `assistant_templates` 表：存储助手模板
- 新增 `workspace_assistants` 表：存储已安装助手实例

#### API 端点
- `GET /api/v1/assistant-library/templates`：列出助手模板
- `GET /api/v1/assistant-library/templates/:id`：获取助手详情
- `POST /api/v1/assistant-library/install`：雇佣助手到 workspace
- `GET /api/v1/workspaces/:slug/assistants`：获取已安装助手列表
- `PATCH /api/v1/workspaces/:slug/assistants/:id`：更新助手配置
- `DELETE /api/v1/workspaces/:slug/assistants/:id`：删除助手

#### 前端页面
- 助手库列表页：浏览、搜索、筛选助手模板
- 助手详情 Modal：查看详情、示例对话、一键雇佣
- Workspace 助手管理：启用/禁用、删除、配置微调
- 助手选择器：在聊天页面选择助手

#### 内建助手模板
- 长文写作助手（多 Agent 编排）
- 市场调研助手（多 Agent 编排）
- 客服助手（单 Agent）
- 代码审查助手（单 Agent）
- 数据分析助手（单 Agent）

---

## [M2] - 2024-12-20 至 2025-01-05

### 🏢 本地/私有化 LLM 支持

#### 部署文档
- `docs/zh-CN/LOCAL_LLM_DEPLOYMENT.md`：本地 LLM 部署完整指南
- `docs/zh-CN/OLLAMA_SETUP.md`：Ollama 配置详细说明
- `docs/zh-CN/TROUBLESHOOTING.md`：常见问题排查

#### 部署方案
- Docker Compose 一键部署
- Kubernetes Helm Charts
- 性能调优建议
- 推荐模型组合（Qwen、DeepSeek、Llama 等）

#### 安装向导
- 首次启动引导：选择云模型/本地模型/混合模式
- 部署模式指示器：在设置页面显示当前部署模式
- 模型推荐：在助手模板中标记推荐模型类型

---

## [M1] - 2024-11-15 至 2024-12-15

### 🎯 项目启动与基础架构

#### 产品定位
- 确定产品定位：企业 AI 工作台 & Agent 服务器
- 制定产品路线图：M1-M4 阶段规划
- 编写 PRD 和系统架构文档

#### 技术选型
- 基于 AnythingLLM (MIT) 进行增强
- 保留核心架构，避免大规模重构
- 采用 Prisma ORM 进行数据建模
- 使用 React + Vite + Tailwind 构建前端

#### 开发规范
- 制定代码规范和命名规范
- 建立 Git 工作流和代码审查流程
- 编写开发文档和 API 文档

---

## 版本说明

### 版本号规则
- **M1-M4**：里程碑版本（Milestone）
- **M3.1-M3.7**：里程碑内的子任务版本

### 发布周期
- 主要功能：每 2-4 周发布一个里程碑版本
- 小功能/修复：每周发布子任务版本
- 紧急修复：随时发布补丁版本

### 兼容性
- 向后兼容 AnythingLLM 核心功能
- 数据库迁移自动执行
- API 版本化（/api/v1）

---

## 下一步计划

### V1.5：企业计费系统 ✅ 已完成
- [x] API Key 管理（名称、有效期、速率限制、使用统计）
- [x] 预算告警通知（余额不足、预算超支）
- [x] 通知中心（站内通知铃铛）
- [x] 计费配置管理

### M4：多租户架构（计划中）
- [ ] 租户隔离机制
- [ ] 租户级别的助手库
- [ ] 租户级别的使用统计
- [ ] 租户级别的权限控制

### M5：高级分析（计划中）
- [ ] 助手使用统计
- [x] 成本追踪和预算控制 ✅ V1.5 已实现
- [ ] 性能监控和告警
- [ ] 用户行为分析

### M6：企业集成（计划中）
- [ ] 企业微信/飞书连接器
- [ ] CRM/ERP 系统集成
- [ ] SSO 单点登录
- [ ] LDAP/AD 集成

---

## 贡献者

感谢所有为 Alata Studio 做出贡献的开发者！

特别感谢 [Mintplex Labs](https://github.com/Mintplex-Labs) 提供的 AnythingLLM 开源项目。

---

## 许可证

Alata Studio 基于 [AnythingLLM (MIT)](https://github.com/Mintplex-Labs/anything-llm) 构建，遵循 MIT 许可证。

所有新增功能和增强均以 MIT 许可证发布。
