# Maintenance Scripts

本目录下的脚本仅供运维与诊断使用，**不会被打包进生产镜像**（已在 .dockerignore 排除）。

## 安全约定

1. 任何写操作脚本必须支持 --dry-run，默认行为应当是 dry-run
2. 必须 require explicit env 标记（DANGEROUS_OPS_ALLOWED=true）才允许真实写入
3. 在生产 DB 上运行需经过 architect 批准

## 脚本清单

| 脚本 | 用途 | 是否写 DB | 必备 env |
|---|---|---|---|
| runPlatformTests.js | 平台冒烟回归 | 是 | DANGEROUS_OPS_ALLOWED=true |
| runAllPlatformTests.js | 全部平台回归 | 是 | DANGEROUS_OPS_ALLOWED=true |
| testAPIRoutes.js | API 路由探活 | 是（写测试数据） | DANGEROUS_OPS_ALLOWED=true |
| testGraphSearch.js | 知识图谱测试 | 否 | （只读） |
| testHitL.js | HitL 流程冒烟 | 是 | DANGEROUS_OPS_ALLOWED=true |
| testKnowledgeSensing.js | 知识感知测试 | 否 | （只读） |
| testPlatformMode.js | 平台模式切换 | 是 | DANGEROUS_OPS_ALLOWED=true |
| testRealPlatform.js | 真实环境测试 | 是 | DANGEROUS_OPS_ALLOWED=true |
| testAITeam.js | AI 团队视图冒烟 | 是 | DANGEROUS_OPS_ALLOWED=true |
| testFrontendWithBrowser.js | 前端平台模式浏览器回归 | 是 | DANGEROUS_OPS_ALLOWED=true |
| testRunModel.js | Run 模型集成测试 | 是 | DANGEROUS_OPS_ALLOWED=true |
| check-assistants.js | 助手数据巡检 | 否 | （只读） |
| debug-assistants.js | 助手调试 | 否 | （只读） |
| batch-fix-assistants.js | 批量修复助手 | 是 | DANGEROUS_OPS_ALLOWED=true |
| fix-dify-assistant.js | Dify 助手修复 | 是 | DANGEROUS_OPS_ALLOWED=true |
| fix-workspace-assistant.js | 工作区助手修复 | 是 | DANGEROUS_OPS_ALLOWED=true |
| test-knowledge-mode.js | 知识模式测试 | 是（创建测试助手） | DANGEROUS_OPS_ALLOWED=true |

## Dry-Run 用法

```bash
node maintenance/runPlatformTests.js --dry-run
```

会打印将执行的操作但不写入。
