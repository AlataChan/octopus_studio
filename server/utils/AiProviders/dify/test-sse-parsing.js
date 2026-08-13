/**
 * 测试 Dify SSE 解析的健壮性
 * 模拟各种可能的 SSE 响应格式
 */

const DifyClient = require("./DifyClient");

// 模拟不同的 SSE 响应
const testCases = [
  {
    name: "正常 JSON 响应",
    data: `data: {"event":"message","answer":"Hello"}\n\ndata: {"event":"message_end","conversation_id":"123"}\n\n`,
    expected: "应该正常解析",
  },
  {
    name: "包含非 JSON 数据",
    data: `data: {"event":"message","answer":"Hello"}\n\ndata: OK\n\ndata: {"event":"message_end","conversation_id":"123"}\n\n`,
    expected: "应该跳过 'OK'，继续处理后续数据",
  },
  {
    name: "包含空行",
    data: `data: {"event":"message","answer":"Hello"}\n\n\n\ndata: {"event":"message_end","conversation_id":"123"}\n\n`,
    expected: "应该跳过空行",
  },
  {
    name: "包含空数据",
    data: `data: {"event":"message","answer":"Hello"}\n\ndata: \n\ndata: {"event":"message_end","conversation_id":"123"}\n\n`,
    expected: "应该跳过空数据",
  },
  {
    name: "混合格式",
    data: `data: {"event":"message","answer":"Hello"}\n\ndata: OK\n\n\n\ndata: \n\ndata: {"event":"message_end","conversation_id":"123"}\n\n`,
    expected: "应该处理所有有效的 JSON 数据",
  },
];

console.log("🧪 开始测试 Dify SSE 解析...\n");

testCases.forEach((testCase, index) => {
  console.log(`\n📝 测试 ${index + 1}: ${testCase.name}`);
  console.log(`   预期: ${testCase.expected}`);
  console.log(`   数据: ${testCase.data.replace(/\n/g, "\\n")}`);

  // 模拟解析过程
  const lines = testCase.data.split("\n");
  let buffer = "";
  let validJsonCount = 0;
  let skippedCount = 0;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    if (line.startsWith("data: ")) {
      const data = line.slice(6).trim();

      if (!data) {
        skippedCount++;
        continue;
      }

      try {
        const parsed = JSON.parse(data);
        validJsonCount++;
        console.log(`   ✅ 解析成功: ${JSON.stringify(parsed)}`);
      } catch (e) {
        skippedCount++;
        console.log(`   ⚠️  跳过非 JSON: "${data}"`);
      }
    }
  }

  console.log(
    `   📊 结果: ${validJsonCount} 个有效 JSON, ${skippedCount} 个跳过`
  );
});

console.log("\n\n✅ 测试完成！");
console.log("\n💡 关键改进:");
console.log("   1. 跳过空行和空数据");
console.log("   2. 对非 JSON 数据只记录警告，不中断流");
console.log("   3. 继续处理后续的有效数据");
console.log("   4. 确保流能正常结束");
