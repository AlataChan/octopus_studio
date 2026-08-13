// frontend/scripts/migrate-theme-tokens.mjs
// 用法：
//   node scripts/migrate-theme-tokens.mjs           # 实际替换
//   node scripts/migrate-theme-tokens.mjs --dry-run # 仅预览，不写文件
// 要求: Node >= 18（使用了 variable-length lookbehind）
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { sync: globSync } = require('glob')

const isDryRun = process.argv.includes('--dry-run')

// ⚠️ 所有 regex 使用 (?!\/) 排除 text-white/60 等透明度变体
// ⚠️ 不处理 dark: 前缀配对，不处理 text-gray-600+ 深色文字
// ⚠️ text-gray-300 映射到 text-secondary（中灰），不映射到 text-primary

const TEXT_RULES = [
  // text-white（无透明度修饰符）→ 主文字
  [/\btext-white(?!\/)/g, 'text-theme-text-primary'],
  // 浅灰正文（gray-100/200 接近白色，映射主文字）
  [/\btext-gray-100(?!\/)/g, 'text-theme-text-primary'],
  [/\btext-gray-200(?!\/)/g, 'text-theme-text-primary'],
  // gray-300 是中灰，映射次要文字而非主文字（避免亮度失真）
  [/\btext-gray-300(?!\/)/g, 'text-theme-text-secondary'],
  // 次要文字
  [/\btext-gray-400(?!\/)/g, 'text-theme-text-secondary'],
  [/\btext-gray-500(?!\/)/g, 'text-theme-text-secondary'],
  [/\btext-zinc-300(?!\/)/g, 'text-theme-text-secondary'],
  [/\btext-zinc-400(?!\/)/g, 'text-theme-text-secondary'],
  [/\btext-slate-300(?!\/)/g, 'text-theme-text-secondary'],
  [/\btext-slate-400(?!\/)/g, 'text-theme-text-secondary'],
]

const BG_RULES = [
  [/\bbg-zinc-900(?!\/)/g, 'bg-theme-bg-primary'],
  [/\bbg-gray-900(?!\/)/g, 'bg-theme-bg-primary'],
  [/\bbg-zinc-800(?!\/)/g, 'bg-theme-bg-secondary'],
  [/\bbg-gray-800(?!\/)/g, 'bg-theme-bg-secondary'],
  // bg-zinc-700 仅替换非 hover: / focus: 前缀的（hover: 前缀需人工处理）
  // Node >= 18 supports variable-length lookbehind
  [/(?<!hover:)(?<!focus:)\bbg-zinc-700(?!\/)/g, 'bg-theme-settings-input-bg'],
  [/(?<!hover:)(?<!focus:)\bbg-gray-700(?!\/)/g, 'bg-theme-settings-input-bg'],
]

const BORDER_RULES = [
  [/\bborder-white\/10\b/g, 'border-theme-border'],
  [/\bborder-white\/20\b/g, 'border-theme-border-medium'],
  [/\bborder-gray-700(?!\/)/g, 'border-theme-modal-border'],
  [/\bborder-zinc-700(?!\/)/g, 'border-theme-modal-border'],
  [/\bborder-gray-500(?!\/)/g, 'border-theme-border'],
  // ⚠️ border-gray-600 excluded: semantics unclear, handle in Task 4 manually
]

const ALL_RULES = [...TEXT_RULES, ...BG_RULES, ...BORDER_RULES]

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const files = globSync('src/**/*.jsx', { cwd: rootDir })

let totalChanges = 0
let changedFiles = 0

for (const file of files) {
  const fullPath = rootDir + file
  const original = readFileSync(fullPath, 'utf8')

  // 跳过含 dark: 配对的文件（不自动处理）
  if (/dark:(text|bg|border)-/.test(original)) {
    console.log(`⚠ SKIP (dark: variants) ${file}`)
    continue
  }

  let content = original
  let fileChanges = 0

  for (const [pattern, replacement] of ALL_RULES) {
    const matches = content.match(pattern) || []
    if (matches.length > 0) {
      content = content.replace(pattern, replacement)
      fileChanges += matches.length
    }
  }

  if (content !== original) {
    changedFiles++
    totalChanges += fileChanges
    if (isDryRun) {
      console.log(`[dry-run] ${file} (${fileChanges} changes)`)
    } else {
      writeFileSync(fullPath, content, 'utf8')
      console.log(`✓ ${file} (${fileChanges} changes)`)
    }
  }
}

const mode = isDryRun ? '[DRY RUN] ' : ''
console.log(`\n${mode}完成：${changedFiles} 个文件，共 ${totalChanges} 处替换`)
if (isDryRun) console.log('运行时不加 --dry-run 以实际写入文件')
