/**
 * PPT DSL v1 - JSON Schema Definition
 *
 * Phase P0: PPT 生成增强 - DSL 定义与校验
 *
 * 设计原则：
 * - 稳定优先：DSL 必须可被 JSON Schema 校验
 * - 渐进产出：每一步只输出 DSL 的子集
 * - 兼容现有：V1 仍以 title/section/bullets/text 为主
 * - 可追溯：为每页提供 sources
 */

/**
 * 支持的幻灯片类型
 */
const SLIDE_TYPES = ["title", "section", "bullets", "text", "chart", "table"];

/**
 * 支持的布局类型
 */
const LAYOUT_TYPES = {
  title: ["title_center", "title_left"],
  section: ["section_center", "section_left"],
  bullets: ["bullets_left", "bullets_two_column"],
  text: ["text_left", "text_center", "text_two_column"],
  chart: ["chart_full", "chart_with_title"],
  table: ["table_full", "table_with_title"],
};

/**
 * 支持的主题
 */
const THEMES = ["default_blue", "default_dark", "default_light", "corporate"];

/**
 * DSL 约束常量
 */
const DSL_CONSTRAINTS = {
  maxSlides: 30,
  minSlides: 1,
  maxBulletsPerSlide: 8,
  maxTitleLength: 100,
  maxSubtitleLength: 200,
  maxContentLength: 2000,
  maxNotesLength: 500,
};

/**
 * Source 引用 Schema
 */
const sourceSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "引用标识符，如 S1, S2" },
    title: { type: "string", description: "来源标题" },
    url: { type: "string", description: "来源链接（可选）" },
    excerpt: { type: "string", description: "摘录内容" },
  },
  required: ["id", "title"],
};

/**
 * 基础幻灯片 Schema（所有类型共享）
 */
const baseSlideSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "幻灯片唯一标识" },
    type: {
      type: "string",
      enum: SLIDE_TYPES,
      description: "幻灯片类型",
    },
    layout: { type: "string", description: "布局类型" },
    title: {
      type: "string",
      maxLength: DSL_CONSTRAINTS.maxTitleLength,
      description: "幻灯片标题",
    },
    notes: {
      type: "string",
      maxLength: DSL_CONSTRAINTS.maxNotesLength,
      description: "演讲者备注",
    },
    sources: {
      type: "array",
      items: sourceSchema,
      description: "引用来源列表",
    },
  },
  required: ["type", "title"],
};

/**
 * Title 类型幻灯片 Schema
 */
const titleSlideSchema = {
  ...baseSlideSchema,
  properties: {
    ...baseSlideSchema.properties,
    type: { type: "string", const: "title" },
    layout: { type: "string", enum: LAYOUT_TYPES.title },
    subtitle: {
      type: "string",
      maxLength: DSL_CONSTRAINTS.maxSubtitleLength,
      description: "副标题",
    },
  },
};

/**
 * Section 类型幻灯片 Schema
 */
const sectionSlideSchema = {
  ...baseSlideSchema,
  properties: {
    ...baseSlideSchema.properties,
    type: { type: "string", const: "section" },
    layout: { type: "string", enum: LAYOUT_TYPES.section },
  },
};

/**
 * Bullets 类型幻灯片 Schema
 */
const bulletsSlideSchema = {
  ...baseSlideSchema,
  properties: {
    ...baseSlideSchema.properties,
    type: { type: "string", const: "bullets" },
    layout: { type: "string", enum: LAYOUT_TYPES.bullets },
    bullets: {
      type: "array",
      items: { type: "string" },
      maxItems: DSL_CONSTRAINTS.maxBulletsPerSlide,
      description: "要点列表",
    },
    items: {
      type: "array",
      items: { type: "string" },
      maxItems: DSL_CONSTRAINTS.maxBulletsPerSlide,
      description: "要点列表（兼容旧格式）",
    },
  },
};

/**
 * Text 类型幻灯片 Schema
 */
const textSlideSchema = {
  ...baseSlideSchema,
  properties: {
    ...baseSlideSchema.properties,
    type: { type: "string", const: "text" },
    layout: { type: "string", enum: LAYOUT_TYPES.text },
    content: {
      type: "string",
      maxLength: DSL_CONSTRAINTS.maxContentLength,
      description: "文本内容",
    },
  },
};

/**
 * Chart 类型幻灯片 Schema（P1 扩展）
 */
const chartSlideSchema = {
  ...baseSlideSchema,
  properties: {
    ...baseSlideSchema.properties,
    type: { type: "string", const: "chart" },
    layout: { type: "string", enum: LAYOUT_TYPES.chart },
    chartType: {
      type: "string",
      enum: [
        "bar",
        "bar3D",
        "line",
        "pie",
        "doughnut",
        "area",
        "scatter",
        "radar",
      ],
      description: "图表类型",
    },
    chartData: {
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: { type: "string" },
          description: "X 轴标签",
        },
        series: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "系列名称" },
              data: {
                type: "array",
                items: { type: "number" },
                description: "数据值",
              },
            },
            required: ["name", "data"],
          },
          description: "数据系列（支持多系列）",
        },
        xAxisTitle: { type: "string", description: "X 轴标题" },
        yAxisTitle: { type: "string", description: "Y 轴标题" },
      },
      required: ["labels", "series"],
      description: "图表数据",
    },
    showValues: {
      type: "boolean",
      default: true,
      description: "是否显示数值标签",
    },
  },
  required: ["type", "title", "chartType", "chartData"],
};

/**
 * Table 类型幻灯片 Schema（P1 扩展）
 */
const tableSlideSchema = {
  ...baseSlideSchema,
  properties: {
    ...baseSlideSchema.properties,
    type: { type: "string", const: "table" },
    layout: { type: "string", enum: LAYOUT_TYPES.table },
    tableData: {
      type: "object",
      properties: {
        headers: { type: "array", items: { type: "string" } },
        rows: {
          type: "array",
          items: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      required: ["headers", "rows"],
      description: "表格数据",
    },
  },
  required: ["type", "title", "tableData"],
};

/**
 * 大纲 DSL Schema（Flow A 输出）
 */
const outlineDSLSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    version: { type: "string", const: "1.0" },
    meta: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        theme: { type: "string", enum: THEMES },
        language: { type: "string", default: "zh-CN" },
        audience: { type: "string", description: "目标受众" },
        tone: { type: "string", description: "语气风格" },
        constraints: {
          type: "object",
          properties: {
            maxSlides: {
              type: "integer",
              minimum: DSL_CONSTRAINTS.minSlides,
              maximum: DSL_CONSTRAINTS.maxSlides,
            },
            maxBulletsPerSlide: {
              type: "integer",
              maximum: DSL_CONSTRAINTS.maxBulletsPerSlide,
            },
          },
        },
      },
      required: ["title"],
    },
    outline: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: SLIDE_TYPES },
          title: { type: "string" },
          purpose: { type: "string", description: "这一页的目的/要点" },
          keyPoints: {
            type: "array",
            items: { type: "string" },
            description: "关键点提示（供 Flow B 填充）",
          },
        },
        required: ["type", "title"],
      },
      minItems: DSL_CONSTRAINTS.minSlides,
      maxItems: DSL_CONSTRAINTS.maxSlides,
    },
  },
  required: ["version", "meta", "outline"],
};

/**
 * 完整 PPT DSL Schema（Flow B 输出）
 */
const fullDSLSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    version: { type: "string", const: "1.0" },
    meta: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        theme: { type: "string", enum: THEMES },
        language: { type: "string" },
        constraints: {
          type: "object",
          properties: {
            maxSlides: { type: "integer" },
            maxBulletsPerSlide: { type: "integer" },
          },
        },
      },
      required: ["title"],
    },
    slides: {
      type: "array",
      items: {
        oneOf: [
          titleSlideSchema,
          sectionSlideSchema,
          bulletsSlideSchema,
          textSlideSchema,
          chartSlideSchema,
          tableSlideSchema,
        ],
      },
      minItems: DSL_CONSTRAINTS.minSlides,
      maxItems: DSL_CONSTRAINTS.maxSlides,
    },
    appendix: {
      type: "object",
      properties: {
        sources: {
          type: "array",
          items: sourceSchema,
        },
      },
    },
  },
  required: ["version", "meta", "slides"],
};

/**
 * 简化版 slides Schema（用于参数校验，兼容旧格式）
 */
const simplifiedSlidesSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "array",
  items: {
    type: "object",
    properties: {
      type: { type: "string", enum: SLIDE_TYPES },
      title: { type: "string" },
      subtitle: { type: "string" },
      content: { type: "string" },
      items: { type: "array", items: { type: "string" } },
      bullets: { type: "array", items: { type: "string" } },
      layout: { type: "string" },
      notes: { type: "string" },
      sources: { type: "array", items: sourceSchema },
      // P1: chart/table data
      chartType: {
        type: "string",
        enum: [
          "bar",
          "bar3D",
          "line",
          "pie",
          "doughnut",
          "area",
          "scatter",
          "radar",
        ],
      },
      chartData: {
        type: "object",
        properties: {
          labels: { type: "array", items: { type: "string" } },
          series: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                data: { type: "array", items: { type: "number" } },
              },
            },
          },
          xAxisTitle: { type: "string" },
          yAxisTitle: { type: "string" },
        },
      },
      showValues: { type: "boolean" },
      tableData: {
        type: "object",
        properties: {
          headers: { type: "array", items: { type: "string" } },
          rows: {
            type: "array",
            items: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    required: ["type", "title"],
  },
  minItems: 1,
  maxItems: DSL_CONSTRAINTS.maxSlides,
};

module.exports = {
  // Schema definitions
  outlineDSLSchema,
  fullDSLSchema,
  simplifiedSlidesSchema,
  sourceSchema,

  // Type constants
  SLIDE_TYPES,
  LAYOUT_TYPES,
  THEMES,
  DSL_CONSTRAINTS,

  // Individual slide schemas (for reference)
  titleSlideSchema,
  sectionSlideSchema,
  bulletsSlideSchema,
  textSlideSchema,
  chartSlideSchema,
  tableSlideSchema,
};
