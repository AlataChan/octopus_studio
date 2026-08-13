#!/usr/bin/env node
/**
 * 插件名验证脚本
 * 用于验证所有 AI 员工配置和前端配置中的插件名是否有效
 *
 * 运行方式: node server/scripts/verify-plugin-names.js
 */

const path = require('path');
const fs = require('fs');

// 1. 加载所有可用的插件
console.log('📦 加载插件系统...\n');
const AgentPlugins = require('../utils/agents/aibitat/plugins');
const pluginDir = path.resolve(__dirname, '../utils/agents/aibitat/plugins');
const pluginDirectoryNames = fs
  .readdirSync(pluginDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '__tests__')
  .map((entry) => entry.name);
const availablePlugins = [
  ...new Set([...Object.keys(AgentPlugins), ...pluginDirectoryNames]),
];

console.log('✅ 可用的插件列表:');
availablePlugins.forEach((plugin, idx) => {
  const pluginObj = AgentPlugins[plugin];
  const displayName = pluginObj?.name || plugin;
  console.log(`   ${idx + 1}. ${plugin} → "${displayName}"`);
});
console.log('');

// 2. 验证 AI 员工配置
console.log('🤖 验证 AI 员工配置...\n');
const { PRESET_TEMPLATES } = require('../data/presetTemplates');

let hasError = false;
PRESET_TEMPLATES.forEach((template, idx) => {
  const tools = [
    ...new Set([
      ...(template.defaultTools || []),
      ...(template.defaultSkills || []),
    ]),
  ];
  if (tools.length === 0) return;

  console.log(`${idx + 1}. ${template.employeeName || template.name} (${template.employeeTitle || template.category})`);
  console.log(`   分类: ${template.category}`);
  console.log(`   工具: ${tools.join(', ')}`);

  // 检查每个工具是否有效
  const invalidTools = tools.filter((tool) => {
    if (tool.startsWith('builtin:')) return false;
    if (tool.startsWith('code_')) return false;
    return !availablePlugins.includes(tool);
  });

  if (invalidTools.length > 0) {
    console.log(`   ❌ 发现无效的插件名: ${invalidTools.join(', ')}`);
    hasError = true;
  } else {
    console.log(`   ✅ 所有插件名有效`);
  }
  console.log('');
});

// 3. 给出建议
console.log('💡 常见错误的插件名对照表:');
console.log('   ❌ save-file-browser  →  ✅ save-file-to-browser');
console.log('   ❌ chart              →  ✅ create-chart');
console.log('   ❌ memory             →  ✅ rag-memory (或 chat-history)');
console.log('');

// 4. 退出状态
if (hasError) {
  console.log('❌ 验证失败: 发现无效的插件名');
  process.exit(1);
} else {
  console.log('✅ 验证通过: 所有插件名都有效');
  process.exit(0);
}
