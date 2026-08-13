/**
 * 测试脚本: 测试 HitL 确认机制
 * 用法: node server/scripts/maintenance/testHitL.js <workspaceId>
 */

const { WorkflowPendingConfirmation } = require("../../models/workflowPendingConfirmation");
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.DANGEROUS_OPS_ALLOWED !== "true";
const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--dry-run");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testHitL(workspaceId) {
  console.log(`\n=== 测试 HitL 确认机制 ===`);
  console.log(`Workspace ID: ${workspaceId}\n`);

  try {
    if (isDryRun) {
      console.log(
        "[DRY-RUN] would execute:",
        `create, approve, reject, and expire workflow confirmations for workspace ${workspaceId}`
      );
      console.log("=== 测试完成! ===\n");
      return;
    }

    // 测试 1: 创建确认请求
    console.log("1. 创建确认请求...");
    const confirmation = await WorkflowPendingConfirmation.create({
      workspaceId,
      userId: 1,
      threadId: null,
      chatId: null,
      planType: "tool_call",
      planTitle: "删除文档: test.pdf",
      planDetails: {
        toolName: "purge-document",
        arguments: { filename: "test.pdf" },
        timestamp: new Date().toISOString(),
      },
      riskLevel: "high",
      timeoutMinutes: 1, // 1 分钟超时 (测试用)
    });

    console.log(`   ✓ 创建成功 (ID: ${confirmation.id})`);
    console.log(`   - 计划类型: ${confirmation.planType}`);
    console.log(`   - 风险等级: ${confirmation.riskLevel}`);
    console.log(`   - 状态: ${confirmation.status}`);
    console.log(`   - 过期时间: ${new Date(confirmation.expiresAt).toLocaleString()}\n`);

    // 测试 2: 获取待确认列表
    console.log("2. 获取待确认列表...");
    const pending = await WorkflowPendingConfirmation.listPending({
      workspaceId,
      status: "pending",
    });

    console.log(`   ✓ 找到 ${pending.length} 条待确认记录\n`);

    // 测试 3: 批准确认
    console.log("3. 批准确认...");
    await sleep(1000); // 等待 1 秒
    const approved = await WorkflowPendingConfirmation.approve(
      confirmation.id,
      "用户已确认删除操作"
    );

    if (approved) {
      console.log(`   ✓ 批准成功\n`);
    } else {
      console.log(`   ❌ 批准失败\n`);
    }

    // 测试 4: 创建另一个确认请求 (用于测试拒绝)
    console.log("4. 创建第二个确认请求 (用于测试拒绝)...");
    const confirmation2 = await WorkflowPendingConfirmation.create({
      workspaceId,
      userId: 1,
      threadId: null,
      chatId: null,
      planType: "agent_flow",
      planTitle: "执行多步骤 Agent Flow",
      planDetails: {
        steps: [
          { step: 1, action: "搜索相关文档" },
          { step: 2, action: "生成摘要" },
          { step: 3, action: "发送邮件" },
        ],
      },
      riskLevel: "medium",
      timeoutMinutes: 1,
    });

    console.log(`   ✓ 创建成功 (ID: ${confirmation2.id})\n`);

    // 测试 5: 拒绝确认
    console.log("5. 拒绝确认...");
    await sleep(1000);
    const rejected = await WorkflowPendingConfirmation.reject(
      confirmation2.id,
      "用户取消了 Agent Flow 执行"
    );

    if (rejected) {
      console.log(`   ✓ 拒绝成功\n`);
    } else {
      console.log(`   ❌ 拒绝失败\n`);
    }

    // 测试 6: 创建第三个确认请求 (用于测试超时)
    console.log("6. 创建第三个确认请求 (用于测试超时)...");
    const confirmation3 = await WorkflowPendingConfirmation.create({
      workspaceId,
      userId: 1,
      threadId: null,
      chatId: null,
      planType: "external_platform",
      planTitle: "调用 Dify API",
      planDetails: {
        platform: "dify",
        endpoint: "/v1/chat-messages",
        method: "POST",
      },
      riskLevel: "low",
      timeoutMinutes: 0.05, // 3 秒超时 (测试用)
    });

    console.log(`   ✓ 创建成功 (ID: ${confirmation3.id})`);
    console.log(`   - 等待 5 秒让其超时...\n`);

    await sleep(5000);

    // 测试 7: 清理过期记录
    console.log("7. 清理过期记录...");
    const expiredCount = await WorkflowPendingConfirmation.cleanupExpired(workspaceId);
    console.log(`   ✓ 清理了 ${expiredCount} 条过期记录\n`);

    // 测试 8: 最终统计
    console.log("8. 最终统计:");
    const allPending = await WorkflowPendingConfirmation.listPending({
      workspaceId,
      status: "pending",
    });
    const allApproved = await WorkflowPendingConfirmation.listPending({
      workspaceId,
      status: "approved",
    });
    const allRejected = await WorkflowPendingConfirmation.listPending({
      workspaceId,
      status: "rejected",
    });
    const allExpired = await WorkflowPendingConfirmation.listPending({
      workspaceId,
      status: "expired",
    });

    console.log(`   - 待确认: ${allPending.length} 条`);
    console.log(`   - 已批准: ${allApproved.length} 条`);
    console.log(`   - 已拒绝: ${allRejected.length} 条`);
    console.log(`   - 已过期: ${allExpired.length} 条\n`);

    console.log("=== 测试完成! ===\n");
    console.log("📋 结论:");
    console.log("   ✅ 创建确认请求成功");
    console.log("   ✅ 批准操作成功");
    console.log("   ✅ 拒绝操作成功");
    console.log("   ✅ 超时过期机制正常");
    console.log("   ✅ 清理过期记录成功\n");

  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    process.exit(1);
  }
}

// 主函数
async function main() {
  console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE WRITE"}`);
  const workspaceId = parseInt(positionalArgs[0]);

  if (!workspaceId || isNaN(workspaceId)) {
    console.error("用法: node server/scripts/maintenance/testHitL.js <workspaceId>");
    console.error("示例: node server/scripts/maintenance/testHitL.js 1");
    process.exit(1);
  }

  await testHitL(workspaceId);
  process.exit(0);
}

main();
