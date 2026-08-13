# 故障排查指南

## 当前问题汇总

### 1. ❌ useState 未定义错误

**错误信息**：

```
@react-refresh:278 Uncaught ReferenceError: useState is not defined
    at ProfileImage (index.jsx?t=1763713410128:326:49)
```

**原因**：

- 热重载缓存问题
- 浏览器缓存了旧版本的代码

**解决方案**：

1. **清除浏览器缓存**：
   - Mac: `Cmd + Shift + R`
   - Windows: `Ctrl + Shift + R`
   - 或者打开开发者工具 → Network → 勾选 "Disable cache"

2. **重启前端开发服务器**：

   ```bash
   cd frontend
   npm run dev
   ```

3. **如果还不行，清除 node_modules 并重新安装**：
   ```bash
   cd frontend
   rm -rf node_modules .vite
   npm install
   npm run dev
   ```

---

### 2. ❌ 输入框超出页面

**问题描述**：

- 聊天内容变长后，输入框超出页面底部
- 无法滚动回到输入框

**已修复**：

- 将 ChatHistory 的 `pb-[100px]` 改为 `pb-6`
- 将 PromptInput 的定位从 `fixed md:absolute` 改为 `relative`
- 现在输入框在 Flexbox 布局中，会自动固定在底部

**测试方法**：

1. 发送大量消息，让聊天内容超过一屏
2. 滚动到顶部
3. 滚动到底部
4. 确认输入框始终可见且可用

---

### 3. ⚠️ Dify 外部助手响应问题

**问题描述**：

- 用户发送 URL 给 Dify 助手
- Dify 返回另一个 URL
- 但前端显示："I can't access external URLs or browse the internet..."

**分析**：

#### 系统架构（非 hardcoding）

```
用户输入
  ↓
ChatContainer (frontend)
  ↓
POST /api/v1/workspace/:slug/stream-chat
  ↓
streamChatWithWorkspace (server/utils/chats/stream.js)
  ↓
检测到 assistantId → 加载助手配置
  ↓
检测到 platformType = "dify" → 调用外部平台处理器
  ↓
handleExternalPlatformChat (server/utils/chats/externalPlatformHandler.js)
  ↓
handleDifyChat → DifyProvider.chatStream
  ↓
DifyClient.chatStream → 调用 Dify API
  ↓
接收 Dify 流式响应 → 转发给前端
  ↓
前端显示响应
```

#### 可能的原因

1. **Dify 工作流配置问题**：
   - Dify 的工作流可能包含一个 LLM 节点
   - 该 LLM 节点看到 URL 后，返回了"I can't access external URLs..."
   - 这是 LLM 的标准回复，不是我们系统的错误

2. **Dify 响应格式问题**：
   - Dify 可能返回了多个消息
   - 我们只显示了第一个消息（LLM 的回复）
   - 实际的 URL 在后续的消息中

#### 调试步骤

1. **检查 Dify 工作流配置**：
   - 登录 Dify 平台
   - 查看该助手的工作流
   - 确认工作流的输出是什么

2. **查看服务器日志**：

   ```bash
   # 在服务器端查看日志
   tail -f server/storage/logs/server.log
   ```

   查找：
   - `[ExternalAssistant] Using external platform: dify`
   - `[DifyProvider]` 相关日志
   - Dify API 的原始响应

3. **测试 Dify API**：
   ```bash
   curl -X POST https://your-dify-url/v1/chat-messages \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "query": "https://example.com",
       "user": "test-user",
       "response_mode": "blocking"
     }'
   ```

#### 解决方案

**方案 A：修改 Dify 工作流**（推荐）

- 在 Dify 中配置工作流，让它正确处理 URL 输入
- 确保工作流的最终输出是你期望的内容

**方案 B：增强响应处理**

- 修改 `handleDifyChat` 函数
- 解析 Dify 的完整响应
- 提取所有相关信息（不仅仅是 answer 字段）

**方案 C：添加调试日志**

- 在 `DifyClient.chatStream` 中添加详细日志
- 记录 Dify 返回的所有事件
- 帮助诊断问题

---

## 前端与 LLM 的集成架构

### 不是 Hardcoding！

系统采用**动态配置 + 插件化架构**：

1. **助手模板**（数据库驱动）：

   ```javascript
   {
     id: "xxx",
     name: "Dify 助手",
     platformType: "dify",  // 动态识别平台
     platformConfig: {
       baseUrl: "https://api.dify.ai/v1",
       apiKey: "app-xxx",
     }
   }
   ```

2. **平台 Provider**（插件化）：
   - `server/utils/AiProviders/dify/`
   - `server/utils/AiProviders/ragflow/`
   - `server/utils/AiProviders/n8n/`
   - 每个平台都是独立的模块

3. **动态路由**：

   ```javascript
   switch (platformType) {
     case "dify":
       return await handleDifyChat(...);
     case "ragflow":
       return await handleRagflowChat(...);
     case "n8n":
       return await handleN8nChat(...);
   }
   ```

4. **配置存储**：
   - 助手配置存储在数据库（`assistant_templates` 表）
   - 用户可以通过 UI 创建/编辑助手
   - 无需修改代码

### 数据流

```
前端 (React)
  ↓ HTTP POST
后端 (Express)
  ↓ 读取数据库
助手配置 (Prisma)
  ↓ 动态加载
平台 Provider (插件)
  ↓ HTTP/WebSocket
外部平台 API (Dify/RAGFlow/n8n)
  ↓ 流式响应
后端 (SSE)
  ↓ 实时推送
前端 (EventSource)
  ↓ 渲染
用户界面
```

---

## 下一步行动

1. **清除浏览器缓存**，解决 useState 错误
2. **测试输入框布局**，确认已修复
3. **检查 Dify 工作流配置**，确认返回的内容
4. **查看服务器日志**，诊断 Dify 响应问题
5. **如需要，添加调试日志**到 DifyClient

---

## 联系支持

如果问题仍然存在，请提供：

1. 完整的浏览器控制台日志
2. 服务器端日志（`server/storage/logs/server.log`）
3. Dify 工作流的截图
4. 测试 Dify API 的原始响应
