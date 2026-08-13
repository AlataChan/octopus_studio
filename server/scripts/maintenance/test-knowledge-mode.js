/**
 * 测试 knowledgeMode 功能的脚本
 *
 * 使用方法：
 * cd server && node scripts/maintenance/test-knowledge-mode.js
 */

const fetch = require("node-fetch");
const {
  KNOWLEDGE_MODE_TEST_ASSISTANTS,
} = require("../../__tests__/fixtures/testAssistants");
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.DANGEROUS_OPS_ALLOWED !== "true";

const API_BASE = "http://localhost:3001/api";
let authToken = null;

// 辅助函数：登录获取 token
async function login() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "password" }),
  });

  const data = await response.json();
  if (data.token) {
    authToken = data.token;
    console.log("✅ 登录成功");
    return true;
  }

  console.error("❌ 登录失败:", data);
  return false;
}

// 辅助函数：发送认证请求
async function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
  });
}

// 测试 1：创建一个 workspace 模式的助手模板
async function testCreateWorkspaceTemplate() {
  console.log("\n📝 测试 1: 创建 workspace 模式助手模板");

  const response = await authFetch(`${API_BASE}/assistant-library/templates`, {
    method: "POST",
    body: JSON.stringify(KNOWLEDGE_MODE_TEST_ASSISTANTS.workspace),
  });

  const data = await response.json();

  if (data.success) {
    console.log("✅ 创建成功:", data.data.id);
    return data.data.id;
  } else {
    console.error("❌ 创建失败:", data.error);
    return null;
  }
}

// 测试 2：创建一个 none 模式的助手模板
async function testCreateNoneTemplate() {
  console.log("\n📝 测试 2: 创建 none 模式助手模板");

  const response = await authFetch(`${API_BASE}/assistant-library/templates`, {
    method: "POST",
    body: JSON.stringify(KNOWLEDGE_MODE_TEST_ASSISTANTS.none),
  });

  const data = await response.json();

  if (data.success) {
    console.log("✅ 创建成功:", data.data.id);
    return data.data.id;
  } else {
    console.error("❌ 创建失败:", data.error);
    return null;
  }
}

// 测试 3：尝试创建一个无效模式的助手模板（应该失败）
async function testCreateInvalidTemplate() {
  console.log("\n📝 测试 3: 创建无效模式助手模板（应该失败）");

  const response = await authFetch(`${API_BASE}/assistant-library/templates`, {
    method: "POST",
    body: JSON.stringify(KNOWLEDGE_MODE_TEST_ASSISTANTS.invalid),
  });

  const data = await response.json();

  if (!data.success) {
    console.log("✅ 正确拒绝了无效模式:", data.error);
    return true;
  } else {
    console.error("❌ 不应该成功创建无效模式的助手");
    return false;
  }
}

// 测试 4：获取第一个 workspace
async function getFirstWorkspace() {
  console.log("\n📝 测试 4: 获取第一个 workspace");

  const response = await authFetch(`${API_BASE}/workspaces`);
  const data = await response.json();

  if (data.workspaces && data.workspaces.length > 0) {
    const workspace = data.workspaces[0];
    console.log("✅ 找到 workspace:", workspace.slug);
    return workspace.slug;
  } else {
    console.error("❌ 没有找到 workspace");
    return null;
  }
}

// 测试 5：安装助手到 workspace
async function testInstallAssistant(templateId, workspaceSlug) {
  console.log(
    `\n📝 测试 5: 安装助手 ${templateId} 到 workspace ${workspaceSlug}`
  );

  const response = await authFetch(`${API_BASE}/assistant-library/install`, {
    method: "POST",
    body: JSON.stringify({
      templateId,
      workspaceSlug,
      instanceName: "我的测试助手实例",
    }),
  });

  const data = await response.json();

  if (data.success) {
    console.log("✅ 安装成功:", data.data.instanceId);
    return data.data.instanceId;
  } else {
    console.error("❌ 安装失败:", data.error);
    return null;
  }
}

// 主测试流程
async function main() {
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE WRITE"}`);
  console.log("🚀 开始测试 knowledgeMode 功能\n");

  if (isDryRun) {
    console.log("[DRY-RUN] would execute:", "login to local API");
    console.log(
      "[DRY-RUN] would execute:",
      "create workspace, none, and invalid knowledge-mode test templates"
    );
    console.log(
      "[DRY-RUN] would execute:",
      "install created assistants into the first workspace"
    );
    return;
  }

  // 登录
  if (!(await login())) {
    return;
  }

  // 测试创建模板
  const workspaceTemplateId = await testCreateWorkspaceTemplate();
  const noneTemplateId = await testCreateNoneTemplate();
  await testCreateInvalidTemplate();

  // 获取 workspace
  const workspaceSlug = await getFirstWorkspace();

  if (!workspaceSlug) {
    console.error("\n❌ 无法继续测试，因为没有找到 workspace");
    return;
  }

  // 安装助手
  if (workspaceTemplateId) {
    await testInstallAssistant(workspaceTemplateId, workspaceSlug);
  }

  if (noneTemplateId) {
    await testInstallAssistant(noneTemplateId, workspaceSlug);
  }

  console.log("\n✅ 所有测试完成！");
  console.log("\n下一步：");
  console.log("1. 在前端查看助手库，确认新创建的助手");
  console.log("2. 在 workspace 设置中查看已安装的助手");
  console.log("3. 发起聊天，观察日志中的 [Chat] Knowledge mode: xxx 输出");
}

main().catch(console.error);
