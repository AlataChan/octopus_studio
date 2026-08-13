#!/usr/bin/env node
/**
 * check-missing-deps.js
 *
 * 检查 monorepo 中各子项目是否有缺失的依赖声明
 * 用于避免 Electron 打包后 MODULE_NOT_FOUND 问题
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

// Node.js 内置模块
const BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
  'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
  'async_hooks', 'diagnostics_channel', 'inspector', 'trace_events', 'wasi'
]);

// 测试相关包（devDependencies 或运行时不需要）
const TEST_PACKAGES = new Set([
  'jest', '@jest/core', '@jest/console', '@jest/expect', '@jest/globals',
  '@jest/test-result', '@jest/transform', '@jest/snapshot', '@jest/reporters',
  '@jest/diff-sequences', '@jest/expect-utils', '@jest/fake-timers',
  '@jest/get-type', '@jest/pattern', '@jest/snapshot-utils',
  '@babel/core', '@babel/code-frame', '@babel/helper-plugin-utils',
  '@bcoe/v8-coverage', '@istanbuljs/load-nyc-config', '@istanbuljs/schema',
  '@sinclair/typebox', '@sinonjs/commons', '@sinonjs/fake-timers',
  '@ungap/structured-clone', '@jridgewell/trace-mapping',
  'babel-plugin-istanbul', 'collect-v8-coverage', 'convert-source-map',
  'dedent', 'emittery', 'execa', 'exit-x', 'expect', 'fb-watchman',
  'istanbul-lib-coverage', 'istanbul-lib-instrument', 'jest-docblock',
  'jest-each', 'jest-haste-map', 'jest-leak-detector', 'jest-matcher-utils',
  'jest-message-util', 'jest-resolve', 'jest-runtime', 'jest-snapshot',
  'jest-util', 'jest-worker', 'supertest'
]);

function extractPackageName(dep) {
  if (dep.startsWith('@')) {
    const parts = dep.split('/');
    return parts.slice(0, 2).join('/');
  }
  return dep.split('/')[0];
}

function getRequires(dir) {
  try {
    const output = execSync(
      `grep -rhoE "require\\(['\"][^'\"./][^'\"]*['\"]\\)" ${dir} --include="*.js" --include="*.cjs" 2>/dev/null || true`,
      { encoding: 'utf-8', cwd: ROOT_DIR }
    );

    return output.split('\n')
      .map(line => line.replace(/require\(['"]/, '').replace(/['"]\)/, ''))
      .filter(Boolean)
      .map(extractPackageName);
  } catch {
    return [];
  }
}

function checkProject(projectName) {
  const projectDir = path.join(ROOT_DIR, projectName);
  const pkgPath = path.join(projectDir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    console.log(`\n[${projectName}] package.json not found, skipping`);
    return { missing: [], rootOnly: [] };
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const declaredDeps = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {})
  ]);

  // 根目录依赖
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  const rootDeps = new Set([
    ...Object.keys(rootPkg.dependencies || {}),
    ...Object.keys(rootPkg.devDependencies || {})
  ]);

  const requires = getRequires(projectName);
  const uniqueRequires = [...new Set(requires)];

  const missing = [];
  const rootOnly = [];

  for (const dep of uniqueRequires) {
    // 跳过内置模块
    if (BUILTINS.has(dep) || dep.startsWith('node:')) continue;
    // 跳过测试包
    if (TEST_PACKAGES.has(dep)) continue;
    // 跳过包含 jest 的包名
    if (dep.toLowerCase().includes('jest')) continue;

    if (!declaredDeps.has(dep)) {
      // 检查是否是已声明依赖的子路径
      const isSubpath = [...declaredDeps].some(d => dep.startsWith(d));
      if (isSubpath) continue;

      if (rootDeps.has(dep)) {
        rootOnly.push(dep);
      } else {
        // 可能是某个依赖的传递依赖，需要进一步检查
        const nodeModulesPath = path.join(ROOT_DIR, 'node_modules', dep);
        if (fs.existsSync(nodeModulesPath)) {
          // 存在于 node_modules，但不在 package.json - 可能是 hoisted
          rootOnly.push(dep + ' (hoisted)');
        } else {
          missing.push(dep);
        }
      }
    }
  }

  return { missing, rootOnly };
}

function main() {
  console.log('='.repeat(60));
  console.log('  Dependency Declaration Check');
  console.log('  检查 monorepo 子项目依赖声明完整性');
  console.log('='.repeat(60));

  const projects = ['server', 'collector'];
  let hasIssues = false;

  for (const project of projects) {
    console.log(`\n[${project}]`);
    const { missing, rootOnly } = checkProject(project);

    if (rootOnly.length > 0) {
      hasIssues = true;
      console.log('  ⚠️  依赖于根目录/hoisted 依赖（打包后可能缺失）:');
      rootOnly.forEach(d => console.log(`      - ${d}`));
    }

    if (missing.length > 0) {
      hasIssues = true;
      console.log('  ❌ 完全未声明的依赖:');
      missing.forEach(d => console.log(`      - ${d}`));
    }

    if (rootOnly.length === 0 && missing.length === 0) {
      console.log('  ✅ 依赖声明完整');
    }
  }

  console.log('\n' + '='.repeat(60));

  if (hasIssues) {
    console.log('  发现潜在问题！请将上述依赖添加到对应项目的 package.json');
    console.log('='.repeat(60));
    process.exit(1);
  } else {
    console.log('  所有检查通过！');
    console.log('='.repeat(60));
  }
}

main();
