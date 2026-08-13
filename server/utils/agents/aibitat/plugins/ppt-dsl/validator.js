/**
 * PPT DSL Validator
 *
 * Phase P0: Schema 校验 + 自动修复重试
 *
 * 功能：
 * - 步骤级校验（Outline 子集 / Final 全量）
 * - 渲染前二次校验
 * - JSON 解析失败修复
 * - Schema 校验失败修复
 * - 重试上限 2 次，超限则降级
 */

const Ajv = require("ajv");
const {
  outlineDSLSchema,
  fullDSLSchema,
  simplifiedSlidesSchema,
  DSL_CONSTRAINTS,
  SLIDE_TYPES,
} = require("./schema");

// 创建 Ajv 实例
// 注意：必须设置 strict: false，避免 oneOf 中的 default 触发 strict mode 错误
// 参考：https://ajv.js.org/strict-mode.html#ignored-defaults
// AJV v8 中，strict 选项为布尔值或包含特定字段的对象
// 我们这里使用 strict: false 完全禁用严格模式，因为 schema 中存在 oneOf + default 组合
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  coerceTypes: true,
  useDefaults: true,
  strict: false, // 禁用 strict mode，允许 oneOf 中使用 default
});

// 编译 Schema
const validateOutline = ajv.compile(outlineDSLSchema);
const validateFullDSL = ajv.compile(fullDSLSchema);
const validateSlides = ajv.compile(simplifiedSlidesSchema);

/**
 * 校验结果类型
 */
const ValidationResult = {
  SUCCESS: "success",
  JSON_ERROR: "json_error",
  SCHEMA_ERROR: "schema_error",
  DEGRADED: "degraded",
};

/**
 * 尝试解析 JSON，支持常见的 LLM 输出格式
 * @param {string} text - 待解析的文本
 * @returns {{ success: boolean, data?: any, error?: string }}
 */
function tryParseJSON(text) {
  if (!text || typeof text !== "string") {
    return { success: false, error: "输入为空或非字符串" };
  }

  // 清理常见的 LLM 输出问题
  let cleaned = text.trim();

  // 移除 markdown 代码块标记
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  // 尝试直接解析
  try {
    const data = JSON.parse(cleaned);
    return { success: true, data };
  } catch (e) {
    // 第一次解析失败，尝试修复常见问题
  }

  // 尝试修复：查找 JSON 对象/数组的起始和结束
  const startBrace = cleaned.indexOf("{");
  const startBracket = cleaned.indexOf("[");
  let start = -1;
  let isObject = true;

  if (startBrace === -1 && startBracket === -1) {
    return { success: false, error: "未找到 JSON 结构" };
  }

  if (startBrace === -1) {
    start = startBracket;
    isObject = false;
  } else if (startBracket === -1) {
    start = startBrace;
    isObject = true;
  } else {
    start = Math.min(startBrace, startBracket);
    isObject = startBrace < startBracket;
  }

  // 查找匹配的结束符
  const endChar = isObject ? "}" : "]";
  let depth = 0;
  let end = -1;

  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === "{" || char === "[") depth++;
    if (char === "}" || char === "]") depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }

  if (end === -1) {
    return { success: false, error: "JSON 结构不完整" };
  }

  const extracted = cleaned.slice(start, end + 1);

  try {
    const data = JSON.parse(extracted);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: `JSON 解析失败: ${e.message}` };
  }
}

/**
 * 校验大纲 DSL
 * @param {Object} data - 大纲数据
 * @returns {{ valid: boolean, errors?: string[], data?: Object }}
 */
function validateOutlineDSL(data) {
  // 确保基本结构
  if (!data.version) data.version = "1.0";
  if (!data.meta) data.meta = { title: "未命名演示文稿" };
  if (!data.outline) data.outline = [];

  const valid = validateOutline(data);

  if (valid) {
    return { valid: true, data };
  }

  const errors = validateOutline.errors.map((err) => {
    return `${err.instancePath || "/"}: ${err.message}`;
  });

  return { valid: false, errors };
}

/**
 * 校验完整 PPT DSL
 * @param {Object} data - 完整 DSL 数据
 * @returns {{ valid: boolean, errors?: string[], data?: Object }}
 */
function validatePPTDSL(data) {
  // 确保基本结构
  if (!data.version) data.version = "1.0";
  if (!data.meta) data.meta = { title: "未命名演示文稿" };
  if (!data.slides) data.slides = [];

  const valid = validateFullDSL(data);

  if (valid) {
    return { valid: true, data };
  }

  const errors = validateFullDSL.errors.map((err) => {
    return `${err.instancePath || "/"}: ${err.message}`;
  });

  return { valid: false, errors };
}

/**
 * 校验简化版 slides（兼容旧格式）
 * @param {Array} slides - 幻灯片数组
 * @returns {{ valid: boolean, errors?: string[], data?: Array }}
 */
function validateSlidesArray(slides) {
  if (!Array.isArray(slides)) {
    return { valid: false, errors: ["slides 必须是数组"] };
  }

  const valid = validateSlides(slides);

  if (valid) {
    return { valid: true, data: slides };
  }

  const errors = validateSlides.errors.map((err) => {
    return `${err.instancePath || "/"}: ${err.message}`;
  });

  return { valid: false, errors };
}

/**
 * 生成 JSON 修复 Prompt
 * @param {string} originalText - 原始文本
 * @param {string} error - 错误信息
 * @returns {string}
 */
function generateJSONFixPrompt(originalText, error) {
  return `你之前输出的 JSON 解析失败，请只输出修复后的纯 JSON，不要包含任何解释文字。

错误信息：${error}

原始输出（可能不完整）：
${originalText.slice(0, 1000)}${originalText.length > 1000 ? "..." : ""}

请直接输出修复后的 JSON：`;
}

/**
 * 生成 Schema 修复 Prompt
 * @param {Object} data - 原始数据
 * @param {string[]} errors - 校验错误列表
 * @param {string} schemaType - Schema 类型 ('outline' | 'full')
 * @returns {string}
 */
function generateSchemaFixPrompt(data, errors, schemaType = "full") {
  const schemaHint =
    schemaType === "outline"
      ? `大纲 DSL 要求：
- version: "1.0"（必填）
- meta: { title: string }（必填）
- outline: 数组，每项需要 { type, title }，可选 purpose, keyPoints`
      : `PPT DSL 要求：
- version: "1.0"（必填）
- meta: { title: string, theme?: string }（必填）
- slides: 数组，每项需要 { type, title }
  - type 可选: title, section, bullets, text, chart, table
  - bullets 类型需要 bullets 或 items 数组
  - text 类型需要 content 字段`;

  return `你输出的 JSON 存在 Schema 校验错误，请只输出修复后的纯 JSON，不要包含任何解释文字。

校验错误：
${errors.slice(0, 5).join("\n")}

${schemaHint}

原始数据：
${JSON.stringify(data, null, 2).slice(0, 2000)}

请直接输出修复后的 JSON：`;
}

/**
 * 降级处理：将不合规的 slide 转换为安全的 bullets/text 类型
 * @param {Array} slides - 幻灯片数组
 * @returns {Array}
 */
function degradeSlides(slides) {
  if (!Array.isArray(slides)) return [];

  return slides.map((slide, index) => {
    // 确保基本字段
    const safeSlide = {
      id: slide.id || `s${index + 1}`,
      type: slide.type || "text",
      title: slide.title || `第 ${index + 1} 页`,
    };

    // 检查类型是否有效
    if (!SLIDE_TYPES.includes(safeSlide.type)) {
      safeSlide.type = "text";
    }

    // 根据类型处理内容
    switch (safeSlide.type) {
      case "title":
        safeSlide.subtitle = slide.subtitle || "";
        break;
      case "section":
        // section 只需要 title
        break;
      case "bullets":
        // 兼容 items 和 bullets
        safeSlide.items = slide.bullets || slide.items || [];
        if (!Array.isArray(safeSlide.items)) {
          safeSlide.items = [];
        }
        // 限制数量
        safeSlide.items = safeSlide.items.slice(
          0,
          DSL_CONSTRAINTS.maxBulletsPerSlide
        );
        break;
      case "chart":
      case "table":
        // P1 扩展类型，暂时降级为 bullets
        if (slide.chartData || slide.tableData) {
          safeSlide.type = "bullets";
          safeSlide.items = ["（原始图表/表格数据已降级）"];
        }
        break;
      case "text":
      default:
        safeSlide.content = slide.content || "";
        break;
    }

    // 保留可选字段
    if (slide.notes) safeSlide.notes = slide.notes;
    if (slide.sources) safeSlide.sources = slide.sources;
    if (slide.layout) safeSlide.layout = slide.layout;

    return safeSlide;
  });
}

/**
 * 完整的校验流程（带自动修复）
 * @param {string|Object} input - 输入（字符串或对象）
 * @param {Object} options - 选项
 * @param {string} options.type - 校验类型 ('outline' | 'full' | 'slides')
 * @param {Function} options.fixCallback - 修复回调函数（用于调用 LLM）
 * @param {number} options.maxRetries - 最大重试次数
 * @returns {Promise<{ result: string, data?: any, errors?: string[] }>}
 */
async function validateWithRetry(input, options = {}) {
  const { type = "slides", fixCallback = null, maxRetries = 2 } = options;

  let data = input;
  let retryCount = 0;
  let lastErrors = [];

  // Step 1: 如果是字符串，先解析 JSON
  if (typeof input === "string") {
    const parseResult = tryParseJSON(input);

    if (!parseResult.success) {
      // JSON 解析失败，尝试修复
      if (fixCallback && retryCount < maxRetries) {
        const fixPrompt = generateJSONFixPrompt(input, parseResult.error);
        const fixedText = await fixCallback(fixPrompt);

        if (fixedText) {
          retryCount++;
          const retryResult = tryParseJSON(fixedText);

          if (retryResult.success) {
            data = retryResult.data;
          } else {
            // 修复失败，降级处理
            return {
              result: ValidationResult.JSON_ERROR,
              errors: [parseResult.error, retryResult.error],
            };
          }
        } else {
          return {
            result: ValidationResult.JSON_ERROR,
            errors: [parseResult.error],
          };
        }
      } else {
        return {
          result: ValidationResult.JSON_ERROR,
          errors: [parseResult.error],
        };
      }
    } else {
      data = parseResult.data;
    }
  }

  // Step 2: Schema 校验
  let validationResult;

  switch (type) {
    case "outline":
      validationResult = validateOutlineDSL(data);
      break;
    case "full":
      validationResult = validatePPTDSL(data);
      break;
    case "slides":
    default:
      // 支持两种格式：直接 slides 数组 或 包含 slides 字段的对象
      const slidesData = Array.isArray(data) ? data : data.slides || data;
      validationResult = validateSlidesArray(slidesData);
      break;
  }

  if (validationResult.valid) {
    return {
      result: ValidationResult.SUCCESS,
      data: validationResult.data,
    };
  }

  lastErrors = validationResult.errors;

  // Step 3: Schema 校验失败，尝试修复
  if (fixCallback && retryCount < maxRetries) {
    const fixPrompt = generateSchemaFixPrompt(
      data,
      validationResult.errors,
      type
    );
    const fixedText = await fixCallback(fixPrompt);

    if (fixedText) {
      retryCount++;
      const parseResult = tryParseJSON(fixedText);

      if (parseResult.success) {
        // 再次校验
        let retryValidation;
        switch (type) {
          case "outline":
            retryValidation = validateOutlineDSL(parseResult.data);
            break;
          case "full":
            retryValidation = validatePPTDSL(parseResult.data);
            break;
          case "slides":
          default:
            const retrySlides = Array.isArray(parseResult.data)
              ? parseResult.data
              : parseResult.data.slides || parseResult.data;
            retryValidation = validateSlidesArray(retrySlides);
            break;
        }

        if (retryValidation.valid) {
          return {
            result: ValidationResult.SUCCESS,
            data: retryValidation.data,
          };
        }

        lastErrors = retryValidation.errors;
      }
    }
  }

  // Step 4: 修复失败，降级处理
  const slidesToDegrade = Array.isArray(data)
    ? data
    : data.slides || data.outline || [];
  const degradedSlides = degradeSlides(slidesToDegrade);

  return {
    result: ValidationResult.DEGRADED,
    data: degradedSlides,
    errors: lastErrors,
  };
}

/**
 * 渲染前的最终校验（简化版，不做修复）
 * @param {Array} slides - 幻灯片数组
 * @returns {{ valid: boolean, slides: Array, warnings: string[] }}
 */
function validateBeforeRender(slides) {
  const warnings = [];

  if (!Array.isArray(slides) || slides.length === 0) {
    return {
      valid: false,
      slides: [],
      warnings: ["slides 为空或格式错误"],
    };
  }

  // 检查每个 slide 的基本要求
  const validatedSlides = slides.map((slide, index) => {
    const validated = { ...slide };

    if (!validated.type) {
      validated.type = "text";
      warnings.push(`第 ${index + 1} 页缺少 type，已设为 text`);
    }

    if (!validated.title) {
      validated.title = `第 ${index + 1} 页`;
      warnings.push(`第 ${index + 1} 页缺少 title`);
    }

    // bullets 类型特殊处理
    if (validated.type === "bullets") {
      if (!validated.items && !validated.bullets) {
        validated.items = [];
        warnings.push(`第 ${index + 1} 页 (bullets) 缺少内容`);
      }
      // 统一使用 items
      if (validated.bullets && !validated.items) {
        validated.items = validated.bullets;
      }
    }

    return validated;
  });

  return {
    valid: true,
    slides: validatedSlides,
    warnings,
  };
}

module.exports = {
  // 校验函数
  tryParseJSON,
  validateOutlineDSL,
  validatePPTDSL,
  validateSlidesArray,
  validateWithRetry,
  validateBeforeRender,

  // 修复 Prompt 生成
  generateJSONFixPrompt,
  generateSchemaFixPrompt,

  // 降级处理
  degradeSlides,

  // 常量
  ValidationResult,
};
