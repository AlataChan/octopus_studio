/**
 * OCR 基准测试脚本
 * 对比预处理前后的 OCR 效果
 */

const path = require("path");
const fs = require("fs");

// 动态解析路径
const isRunFromRoot = process.cwd().endsWith("Alata-studio");
const basePath = isRunFromRoot ? "collector" : ".";
const OCRLoader = require(path.resolve(basePath, "utils/OCRLoader"));
const ImagePreprocessor = require(path.resolve(
  basePath,
  "utils/OCRLoader/imagePreprocessor"
));

const SAMPLES_DIR = path.resolve(
  basePath,
  "__tests__/fixtures/ocr_samples"
);

/**
 * 运行单个样本的 OCR 测试
 * @param {string} filePath - 图片路径
 * @param {OCRLoader} loader - OCR 加载器
 * @param {Object} options - OCR 选项
 */
async function testSample(filePath, loader, options = {}) {
  const startTime = Date.now();

  try {
    const result = await loader.ocrImage(filePath, options);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!result) {
      return { success: false, duration, text: "", confidence: 0, charCount: 0, wordCount: 0, error: "No result" };
    }

    return {
      success: true,
      duration,
      text: result.pageContent,
      confidence: result.metadata?.confidence || 0,
      wordCount: result.pageContent.split(/\s+/).filter(Boolean).length,
      charCount: result.pageContent.length,
      preprocessed: result.metadata?.preprocessed,
      binarized: result.metadata?.binarized,
      analysis: result.metadata?.imageAnalysis,
    };
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    return {
      success: false,
      duration,
      text: "",
      confidence: 0,
      charCount: 0,
      wordCount: 0,
      error: error.message
    };
  }
}

/**
 * 主测试函数
 */
async function runBenchmark() {
  console.log("\n" + "=".repeat(80));
  console.log("📊 OCR 基准测试 - 智能预处理效果对比");
  console.log("=".repeat(80) + "\n");

  // 获取所有样本文件
  const files = fs
    .readdirSync(SAMPLES_DIR)
    .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.log("❌ 未找到测试样本文件");
    return;
  }

  console.log(`📁 找到 ${files.length} 个测试样本\n`);

  // 创建三个 loader：无预处理、强制预处理、智能预处理
  const loaderNoPreprocess = new OCRLoader({
    language: "chi_sim+eng",
    enablePreprocessing: false,
  });

  const loaderForcePreprocess = new OCRLoader({
    language: "chi_sim+eng",
    enablePreprocessing: true,
    enableBinarization: true,
  });

  const loaderSmartPreprocess = new OCRLoader({
    language: "chi_sim+eng",
    enablePreprocessing: true,
    enableBinarization: true,
  });

  const results = [];

  for (const file of files) {
    const filePath = path.join(SAMPLES_DIR, file);
    console.log(`\n🔍 测试: ${file}`);
    console.log("-".repeat(60));

    // 1. 无预处理
    console.log("  ⏳ 无预处理...");
    const noPP = await testSample(filePath, loaderNoPreprocess, { preprocess: false, smartPreprocess: false });

    // 2. 强制预处理（全量）
    console.log("  ⏳ 强制预处理...");
    const forcePP = await testSample(filePath, loaderForcePreprocess, { preprocess: true, smartPreprocess: false });

    // 3. 智能预处理
    console.log("  ⏳ 智能预处理...");
    const smartPP = await testSample(filePath, loaderSmartPreprocess, { smartPreprocess: true });

    results.push({
      file,
      noPreprocess: noPP,
      forcePreprocess: forcePP,
      smartPreprocess: smartPP,
    });

    // 输出对比结果
    console.log(`\n  📈 结果对比:`);
    console.log(`     无预处理:   ${noPP.duration}s, ${noPP.charCount} 字符`);
    console.log(`     强制预处理: ${forcePP.duration}s, ${forcePP.charCount} 字符`);
    console.log(`     智能预处理: ${smartPP.duration}s, ${smartPP.charCount} 字符`);

    // 显示智能预处理的决策
    if (smartPP.analysis) {
      console.log(`     🧠 智能决策: ${smartPP.analysis.imageType || 'unknown'} → ${smartPP.analysis.strategy || 'default'}`);
    }

    // 显示部分识别文本
    const textToShow = smartPP.text || forcePP.text || noPP.text;
    if (textToShow) {
      const preview = textToShow.slice(0, 100).replace(/\n/g, " ");
      console.log(`     预览: ${preview}${textToShow.length > 100 ? "..." : ""}`);
    }
  }

  // 生成汇总报告
  printSummary(results);

  // 保存详细结果
  await saveResults(results);

  console.log("\n✅ 测试完成！");
}

/**
 * 打印汇总报告
 */
function printSummary(results) {
  console.log("\n" + "=".repeat(100));
  console.log("📋 汇总报告 - 智能预处理效果对比");
  console.log("=".repeat(100));

  console.log("\n| 样本                      | 无预处理 | 强制预处理 | 智能预处理 | 智能决策           | 最优? |");
  console.log("|---------------------------|----------|------------|------------|--------------------| ------|");

  let smartWinsCount = 0;
  let forceWinsCount = 0;
  let noPreWinsCount = 0;

  for (const r of results) {
    const no = r.noPreprocess;
    const force = r.forcePreprocess;
    const smart = r.smartPreprocess;

    // 找出最优结果
    const chars = [no.charCount, force.charCount, smart.charCount];
    const maxChars = Math.max(...chars);

    let winner = "";
    if (smart.charCount === maxChars) {
      smartWinsCount++;
      winner = "✅ 智能";
    } else if (force.charCount === maxChars) {
      forceWinsCount++;
      winner = "强制";
    } else {
      noPreWinsCount++;
      winner = "无预处理";
    }

    const decision = smart.analysis?.imageType || "default";

    console.log(
      `| ${r.file.slice(0, 25).padEnd(25)} | ${String(no.charCount).padStart(8)} | ${String(force.charCount).padStart(10)} | ${String(smart.charCount).padStart(10)} | ${decision.padEnd(18)} | ${winner.padEnd(6)} |`
    );
  }

  console.log("\n📊 统计:");
  console.log(`   - 测试样本数: ${results.length}`);
  console.log(`   - 智能预处理胜出: ${smartWinsCount}/${results.length} (${((smartWinsCount/results.length)*100).toFixed(0)}%)`);
  console.log(`   - 强制预处理胜出: ${forceWinsCount}/${results.length}`);
  console.log(`   - 无预处理胜出: ${noPreWinsCount}/${results.length}`);
}

/**
 * 保存详细结果到文件
 */
async function saveResults(results) {
  const outputPath = path.resolve(basePath, "__tests__/fixtures/ocr_samples/benchmark_results.json");

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalSamples: results.length,
      smartWins: results.filter(r => {
        const chars = [r.noPreprocess.charCount, r.forcePreprocess.charCount, r.smartPreprocess.charCount];
        return r.smartPreprocess.charCount === Math.max(...chars);
      }).length,
    },
    results: results.map(r => ({
      file: r.file,
      noPreprocess: { ...r.noPreprocess, text: r.noPreprocess.text.slice(0, 500) },
      forcePreprocess: { ...r.forcePreprocess, text: r.forcePreprocess.text.slice(0, 500) },
      smartPreprocess: { ...r.smartPreprocess, text: r.smartPreprocess.text.slice(0, 500) },
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 详细结果已保存到: ${outputPath}`);
}

// 运行测试
runBenchmark().catch(console.error);

