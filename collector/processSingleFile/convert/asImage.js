const { v4 } = require("uuid");
const { tokenizeString } = require("../../utils/tokenizer");
const {
  createdDate,
  trashFile,
  writeToServerDocuments,
} = require("../../utils/files");
const OCRLoader = require("../../utils/OCRLoader");
const { SmartOCRRouter } = require("../../utils/OCRLoader/smartOCRRouter");
const { default: slugify } = require("slugify");

// 单例 SmartOCRRouter 实例（延迟初始化）
let smartOCRInstance = null;

/**
 * 获取 SmartOCRRouter 实例
 * @param {Object} options - OCR 配置选项
 * @returns {SmartOCRRouter}
 */
function getSmartOCRRouter(options = {}) {
  if (!smartOCRInstance) {
    smartOCRInstance = new SmartOCRRouter({
      targetLanguages:
        options.langList || process.env.TARGET_OCR_LANG || "chi_sim,eng",
      paddleOCRURL: process.env.PADDLEOCR_URL || "http://127.0.0.1:8866",
      defaultEngine: process.env.DEFAULT_OCR_ENGINE || "tesseract",
    });
  }
  return smartOCRInstance;
}

async function asImage({
  fullFilePath = "",
  filename = "",
  options = {},
  metadata = {},
}) {
  let ocrResult;

  // 检查是否使用 SmartOCR 路由（新模式）
  const useSmartOCR =
    options?.ocr?.useSmartOCR ?? process.env.USE_SMART_OCR === "true";

  if (useSmartOCR) {
    // ⭐ 使用 SmartOCRRouter 进行智能引擎选择
    const smartOCR = getSmartOCRRouter(options?.ocr);
    ocrResult = await smartOCR.ocrAuto(fullFilePath, {
      skill: metadata.skill,
      assistant: metadata.assistant,
      workspace: metadata.workspace,
      documentTitle: metadata.title || filename,
      preferEngine: options?.ocr?.preferEngine,
    });
  } else {
    // 原有逻辑：直接使用 OCRLoader (Tesseract)
    ocrResult = await new OCRLoader({
      targetLanguages: options?.ocr?.langList,
      enablePreprocessing: options?.ocr?.enablePreprocessing ?? true,
      enableBinarization: options?.ocr?.enableBinarization ?? true,
    }).ocrImage(fullFilePath);
  }

  // 兼容新的返回格式：{ pageContent, metadata } 或旧格式 string
  const content =
    typeof ocrResult === "string" ? ocrResult : ocrResult?.pageContent || "";

  if (!content?.length) {
    console.error(`Resulting text content was empty for ${filename}.`);
    trashFile(fullFilePath);
    return {
      success: false,
      reason: `No text content found in ${filename}.`,
      documents: [],
    };
  }

  console.log(`-- Working ${filename} --`);
  const data = {
    id: v4(),
    url: "file://" + fullFilePath,
    title: metadata.title || filename,
    docAuthor: metadata.docAuthor || "Unknown",
    description: metadata.description || "Unknown",
    docSource: metadata.docSource || "image file uploaded by the user.",
    chunkSource: metadata.chunkSource || "",
    published: createdDate(fullFilePath),
    wordCount: content.split(" ").length,
    pageContent: content,
    token_count_estimate: tokenizeString(content),
    // 添加 OCR 元信息（如果可用）
    ...(ocrResult?.metadata && {
      ocrEngine: ocrResult.metadata.engine,
      ocrConfidence: ocrResult.metadata.confidence,
      ocrPreprocessed: ocrResult.metadata.preprocessed,
      ocrExecutionTime: ocrResult.metadata.executionTime,
      ocrFallback: ocrResult.metadata.fallback,
    }),
  };

  const document = writeToServerDocuments({
    data,
    filename: `${slugify(filename)}-${data.id}`,
    options: { parseOnly: options.parseOnly },
  });
  trashFile(fullFilePath);
  console.log(`[SUCCESS]: ${filename} converted & ready for embedding.\n`);
  return { success: true, reason: null, documents: [document] };
}

module.exports = asImage;
