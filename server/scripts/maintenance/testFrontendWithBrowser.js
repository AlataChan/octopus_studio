/**
 * 使用 Playwright 自动化测试前端
 * 测试 4-5: 验证 Dify 响应和对比测试
 */

const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const isDryRun =
  process.argv.includes('--dry-run') ||
  process.env.DANGEROUS_OPS_ALLOWED !== 'true';

// 测试配置
const BASE_URL = 'http://localhost:3000';
const WORKSPACE_SLUG = '7134297c-b24d-412f-96df-224fecefb798';
const DIFY_ASSISTANT_INSTANCE_ID = '434ad729-df6d-4c88-a0b5-7fc3e37561a7';
const TEST_MESSAGE = '产品需求';

// 确保截图目录存在
const screenshotDir = path.join(__dirname, '../../tests/screenshots');
if (!isDryRun && !fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function test4_verifyDifyResponse() {
  console.log('\n========== 测试 4: 验证 Dify 响应 ==========\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 访问 Workspace
    console.log(`📍 访问: ${BASE_URL}/workspace/${WORKSPACE_SLUG}`);
    await page.goto(`${BASE_URL}/workspace/${WORKSPACE_SLUG}`, { waitUntil: 'networkidle' });
    
    // 等待页面加载
    await page.waitForTimeout(3000);
    
    // 截图 1: 初始页面
    await page.screenshot({ path: path.join(screenshotDir, 'test4-1-initial.png'), fullPage: true });
    console.log('📸 截图已保存: test4-1-initial.png');

    // 2. 查找并点击输入框
    console.log('🔍 查找输入框...');
    
    // 尝试多种选择器
    const inputSelectors = [
      'textarea[placeholder*="消息"], textarea[placeholder*="message"]',
      'textarea',
      'input[type="text"]',
      '[contenteditable="true"]',
    ];

    let inputBox = null;
    for (const selector of inputSelectors) {
      try {
        inputBox = await page.locator(selector).first();
        if (await inputBox.isVisible({ timeout: 2000 })) {
          console.log(`✅ 找到输入框: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!inputBox || !(await inputBox.isVisible())) {
      console.log('❌ 未找到输入框,请手动测试');
      await page.screenshot({ path: path.join(screenshotDir, 'test4-error-no-input.png'), fullPage: true });
      return { success: false, error: '未找到输入框' };
    }

    // 3. 输入消息
    console.log(`✏️  输入消息: "${TEST_MESSAGE}"`);
    await inputBox.fill(TEST_MESSAGE);
    await page.waitForTimeout(1000);

    // 截图 2: 输入消息后
    await page.screenshot({ path: path.join(screenshotDir, 'test4-2-message-input.png'), fullPage: true });
    console.log('📸 截图已保存: test4-2-message-input.png');

    // 4. 发送消息
    console.log('📤 发送消息...');
    
    // 尝试多种发送方式
    const sendSelectors = [
      'button:has-text("发送")',
      'button:has-text("Send")',
      'button[type="submit"]',
      'button svg', // 可能是图标按钮
    ];

    let sent = false;
    for (const selector of sendSelectors) {
      try {
        const sendButton = await page.locator(selector).first();
        if (await sendButton.isVisible({ timeout: 2000 })) {
          await sendButton.click();
          console.log(`✅ 点击发送按钮: ${selector}`);
          sent = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!sent) {
      // 尝试按 Enter 键
      console.log('⌨️  尝试按 Enter 键发送...');
      await inputBox.press('Enter');
      sent = true;
    }

    // 5. 等待响应
    console.log('⏳ 等待 Dify 响应 (最多 60 秒)...');
    await page.waitForTimeout(5000);

    // 截图 3: 等待响应
    await page.screenshot({ path: path.join(screenshotDir, 'test4-3-waiting-response.png'), fullPage: true });
    console.log('📸 截图已保存: test4-3-waiting-response.png');

    // 等待更长时间以获取完整响应
    await page.waitForTimeout(30000);

    // 截图 4: 最终响应
    await page.screenshot({ path: path.join(screenshotDir, 'test4-4-final-response.png'), fullPage: true });
    console.log('📸 截图已保存: test4-4-final-response.png');

    console.log('\n✅ 测试 4 完成!');
    console.log('   请查看截图确认 Dify 是否正常响应\n');

    // 保持浏览器打开 10 秒,让用户查看
    console.log('⏸️  浏览器将在 10 秒后关闭...');
    await page.waitForTimeout(10000);

    return { success: true };

  } catch (error) {
    console.error('❌ 测试 4 失败:', error.message);
    await page.screenshot({ path: path.join(screenshotDir, 'test4-error.png'), fullPage: true });
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

async function test5_compareWithAndWithoutGraph() {
  console.log('\n========== 测试 5: 对比测试 (有无图谱上下文) ==========\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ========== 场景 A: 关闭图谱上下文 ==========
    console.log('🔧 场景 A: 关闭图谱上下文\n');

    // 1. 修改数据库
    await prisma.workspace_assistants.update({
      where: { id: DIFY_ASSISTANT_INSTANCE_ID },
      data: { knowledgeModeOverride: 'none' },
    });
    console.log('✅ 已设置 knowledgeModeOverride = "none"');

    // 2. 访问页面
    console.log(`📍 访问: ${BASE_URL}/workspace/${WORKSPACE_SLUG}`);
    await page.goto(`${BASE_URL}/workspace/${WORKSPACE_SLUG}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 3. 发送消息 (场景 A)
    console.log(`✏️  输入消息: "${TEST_MESSAGE}" (无图谱上下文)`);
    
    const inputBox = await page.locator('textarea, input[type="text"]').first();
    await inputBox.fill(TEST_MESSAGE);
    await page.waitForTimeout(1000);
    await inputBox.press('Enter');

    console.log('⏳ 等待响应...');
    await page.waitForTimeout(30000);

    // 截图: 场景 A
    await page.screenshot({ path: path.join(screenshotDir, 'test5-answer-a-no-graph.png'), fullPage: true });
    console.log('📸 截图已保存: test5-answer-a-no-graph.png\n');

    // ========== 场景 B: 开启图谱上下文 ==========
    console.log('🔧 场景 B: 开启图谱上下文\n');

    // 4. 修改数据库
    await prisma.workspace_assistants.update({
      where: { id: DIFY_ASSISTANT_INSTANCE_ID },
      data: { knowledgeModeOverride: null },
    });
    console.log('✅ 已设置 knowledgeModeOverride = NULL');

    // 5. 刷新页面
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 6. 发送相同消息 (场景 B)
    console.log(`✏️  输入消息: "${TEST_MESSAGE}" (有图谱上下文)`);
    
    const inputBox2 = await page.locator('textarea, input[type="text"]').first();
    await inputBox2.fill(TEST_MESSAGE);
    await page.waitForTimeout(1000);
    await inputBox2.press('Enter');

    console.log('⏳ 等待响应...');
    await page.waitForTimeout(30000);

    // 截图: 场景 B
    await page.screenshot({ path: path.join(screenshotDir, 'test5-answer-b-with-graph.png'), fullPage: true });
    console.log('📸 截图已保存: test5-answer-b-with-graph.png\n');

    console.log('✅ 测试 5 完成!');
    console.log('   请对比两张截图,查看有无图谱上下文的差异\n');

    // 保持浏览器打开 10 秒
    console.log('⏸️  浏览器将在 10 秒后关闭...');
    await page.waitForTimeout(10000);

    return { success: true };

  } catch (error) {
    console.error('❌ 测试 5 失败:', error.message);
    await page.screenshot({ path: path.join(screenshotDir, 'test5-error.png'), fullPage: true });
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE WRITE'}`);
  console.log('\n========== Platform 模式前端自动化测试 ==========\n');

  if (isDryRun) {
    console.log(
      '[DRY-RUN] would execute:',
      `open ${BASE_URL}, send test chat, take screenshots, and toggle ${DIFY_ASSISTANT_INSTANCE_ID} knowledgeModeOverride`
    );
    return;
  }

  // 执行测试 4
  const result4 = await test4_verifyDifyResponse();

  // 执行测试 5
  const result5 = await test5_compareWithAndWithoutGraph();

  console.log('\n========== 测试完成 ==========\n');
  console.log('📊 测试结果:');
  console.log(`   测试 4: ${result4.success ? '✅ 成功' : '❌ 失败'}`);
  console.log(`   测试 5: ${result5.success ? '✅ 成功' : '❌ 失败'}`);
  console.log(`\n📁 截图目录: ${screenshotDir}\n`);
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
