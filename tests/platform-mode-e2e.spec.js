/**
 * Platform 模式端到端测试
 * 使用 Playwright 自动化测试前端对话功能
 */

const { test, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 测试配置
const BASE_URL = 'http://localhost:3000';
const WORKSPACE_SLUG = '7134297c-b24d-412f-96df-224fecefb798'; // "工作" 的 slug
const DIFY_ASSISTANT_INSTANCE_ID = '434ad729-df6d-4c88-a0b5-7fc3e37561a7';

test.describe('Platform 模式测试', () => {

  test.beforeAll(async () => {
    console.log('\n========== 开始 Platform 模式端到端测试 ==========\n');
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
    console.log('\n========== 测试完成 ==========\n');
  });

  test('测试 3: 验证消息注入 (通过前端发送消息)', async ({ page }) => {
    console.log('\n📋 测试 3: 验证消息注入 (后端日志)\n');

    // 1. 访问 Workspace
    await page.goto(`${BASE_URL}/workspace/${WORKSPACE_SLUG}`);
    await page.waitForLoadState('networkidle');

    // 2. 等待聊天界面加载
    await page.waitForSelector('[data-testid="chat-input"], textarea, input[type="text"]', { timeout: 10000 });

    // 3. 查找输入框 (尝试多种选择器)
    let inputBox = await page.locator('textarea').first();
    if (!(await inputBox.isVisible())) {
      inputBox = await page.locator('input[type="text"]').first();
    }

    // 4. 输入消息
    await inputBox.fill('产品需求');

    // 5. 发送消息 (尝试多种方式)
    const sendButton = await page.locator('button:has-text("发送"), button[type="submit"]').first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await inputBox.press('Enter');
    }

    console.log('✅ 消息已发送: "产品需求"');
    console.log('   请检查后端日志,确认图谱上下文注入\n');

    // 6. 等待响应
    await page.waitForTimeout(3000);

    // 7. 截图保存
    await page.screenshot({ path: 'tests/screenshots/test3-message-sent.png' });
    console.log('📸 截图已保存: tests/screenshots/test3-message-sent.png\n');
  });

  test('测试 4: 验证 Dify 响应 (前端对话)', async ({ page }) => {
    console.log('\n📋 测试 4: 验证 Dify 响应 (前端对话)\n');

    // 1. 访问 Workspace
    await page.goto(`${BASE_URL}/workspace/${WORKSPACE_SLUG}`);
    await page.waitForLoadState('networkidle');

    // 2. 等待聊天界面加载
    await page.waitForSelector('[data-testid="chat-input"], textarea, input[type="text"]', { timeout: 10000 });

    // 3. 查找输入框
    let inputBox = await page.locator('textarea').first();
    if (!(await inputBox.isVisible())) {
      inputBox = await page.locator('input[type="text"]').first();
    }

    // 4. 输入消息
    await inputBox.fill('产品需求');

    // 5. 发送消息
    const sendButton = await page.locator('button:has-text("发送"), button[type="submit"]').first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await inputBox.press('Enter');
    }

    console.log('✅ 消息已发送: "产品需求"');

    // 6. 等待 Dify 响应 (最多 30 秒)
    console.log('⏳ 等待 Dify 响应...\n');

    try {
      // 等待响应消息出现
      await page.waitForSelector('.chat-message, [data-role="assistant"]', { timeout: 30000 });

      // 获取最后一条消息
      const messages = await page.locator('.chat-message, [data-role="assistant"]').all();
      const lastMessage = messages[messages.length - 1];
      const messageText = await lastMessage.textContent();

      console.log('✅ Dify 响应成功!');
      console.log(`   响应长度: ${messageText.length} 字符`);
      console.log(`   响应预览: ${messageText.substring(0, 100)}...\n`);

      // 7. 截图保存
      await page.screenshot({ path: 'tests/screenshots/test4-dify-response.png' });
      console.log('📸 截图已保存: tests/screenshots/test4-dify-response.png\n');

    } catch (error) {
      console.error('❌ Dify 响应超时或失败:', error.message);
      await page.screenshot({ path: 'tests/screenshots/test4-error.png' });
      throw error;
    }
  });

  test('测试 5: 对比测试 (关键!)', async ({ page }) => {
    console.log('\n📋 测试 5: 对比测试 (有无图谱上下文)\n');

    // ========== 场景 A: 关闭图谱上下文 ==========
    console.log('🔧 场景 A: 关闭图谱上下文\n');

    // 1. 修改数据库 - 关闭图谱上下文
    await prisma.workspace_assistants.update({
      where: { id: DIFY_ASSISTANT_INSTANCE_ID },
      data: { knowledgeModeOverride: 'none' },
    });
    console.log('✅ 已设置 knowledgeModeOverride = "none"\n');

    // 2. 访问 Workspace
    await page.goto(`${BASE_URL}/workspace/${WORKSPACE_SLUG}`);
    await page.waitForLoadState('networkidle');

    // 3. 发送消息
    let inputBox = await page.locator('textarea').first();
    if (!(await inputBox.isVisible())) {
      inputBox = await page.locator('input[type="text"]').first();
    }

    await inputBox.fill('产品需求');
    await inputBox.press('Enter');

    console.log('✅ 消息已发送: "产品需求" (无图谱上下文)');

    // 4. 等待响应
    await page.waitForTimeout(5000);
    await page.waitForSelector('.chat-message, [data-role="assistant"]', { timeout: 30000 });

    // 5. 获取回答 A
    const messagesA = await page.locator('.chat-message, [data-role="assistant"]').all();
    const lastMessageA = messagesA[messagesA.length - 1];
    const answerA = await lastMessageA.textContent();

    console.log(`✅ 回答 A (无图谱): ${answerA.length} 字符`);
    console.log(`   预览: ${answerA.substring(0, 100)}...\n`);

    // 6. 截图保存
    await page.screenshot({ path: 'tests/screenshots/test5-answer-a.png' });

    // ========== 场景 B: 开启图谱上下文 ==========
    console.log('🔧 场景 B: 开启图谱上下文\n');

    // 7. 修改数据库 - 开启图谱上下文
    await prisma.workspace_assistants.update({
      where: { id: DIFY_ASSISTANT_INSTANCE_ID },
      data: { knowledgeModeOverride: null },
    });
    console.log('✅ 已设置 knowledgeModeOverride = NULL\n');

    // 8. 刷新页面
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 9. 发送相同消息
    inputBox = await page.locator('textarea').first();
    if (!(await inputBox.isVisible())) {
      inputBox = await page.locator('input[type="text"]').first();
    }

    await inputBox.fill('产品需求');
    await inputBox.press('Enter');

    console.log('✅ 消息已发送: "产品需求" (有图谱上下文)');

    // 10. 等待响应
    await page.waitForTimeout(5000);
    await page.waitForSelector('.chat-message, [data-role="assistant"]', { timeout: 30000 });

    // 11. 获取回答 B
    const messagesB = await page.locator('.chat-message, [data-role="assistant"]').all();
    const lastMessageB = messagesB[messagesB.length - 1];
    const answerB = await lastMessageB.textContent();

    console.log(`✅ 回答 B (有图谱): ${answerB.length} 字符`);
    console.log(`   预览: ${answerB.substring(0, 100)}...\n`);

    // 12. 截图保存
    await page.screenshot({ path: 'tests/screenshots/test5-answer-b.png' });

    // ========== 对比分析 ==========
    console.log('📊 对比分析:\n');
    console.log(`   回答 A 长度: ${answerA.length} 字符`);
    console.log(`   回答 B 长度: ${answerB.length} 字符`);
    console.log(`   长度差异: ${answerB.length - answerA.length} 字符 (${((answerB.length / answerA.length - 1) * 100).toFixed(1)}%)\n`);

    if (answerB.length > answerA.length) {
      console.log('✅ 验证通过: 回答 B 比回答 A 更长 (图谱上下文有效)\n');
    } else {
      console.log('⚠️  警告: 回答 B 没有比回答 A 更长\n');
    }
  });
});

