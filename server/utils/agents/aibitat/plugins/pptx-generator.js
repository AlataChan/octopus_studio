/**
 * PowerPoint Generator Plugin
 *
 * 用于生成 PowerPoint 演示文稿 (.pptx)
 *
 * Phase P0: 支持 theme 和 layout 字段
 * Phase P1: 支持 chart 和 table 类型（待实现）
 */

const { Deduplicator } = require("../utils/dedupe");
const PptxGenJS = require("pptxgenjs");

/**
 * 主题配色配置
 */
const THEME_COLORS = {
  default_blue: {
    primary: "1A73E8",
    secondary: "4285F4",
    accent: "34A853",
    text: "363636",
    textLight: "666666",
    background: "FFFFFF",
  },
  default_dark: {
    primary: "BB86FC",
    secondary: "03DAC6",
    accent: "CF6679",
    text: "FFFFFF",
    textLight: "B3B3B3",
    background: "121212",
  },
  default_light: {
    primary: "6200EE",
    secondary: "03DAC6",
    accent: "FF5722",
    text: "363636",
    textLight: "666666",
    background: "FAFAFA",
  },
  corporate: {
    primary: "003366",
    secondary: "006699",
    accent: "CC3300",
    text: "333333",
    textLight: "666666",
    background: "FFFFFF",
  },
};

/**
 * 获取主题样式
 * @param {string} theme - 主题名称
 * @returns {Object}
 */
function getThemeStyles(theme = "default_blue") {
  const colors = THEME_COLORS[theme] || THEME_COLORS.default_blue;

  return {
    title: {
      fontSize: 44,
      bold: true,
      color: colors.primary,
    },
    subtitle: {
      fontSize: 24,
      color: colors.textLight,
    },
    sectionTitle: {
      fontSize: 36,
      bold: true,
      color: colors.primary,
    },
    heading: {
      fontSize: 28,
      bold: true,
      color: colors.text,
    },
    body: {
      fontSize: 18,
      color: colors.text,
    },
    bullet: {
      fontSize: 20,
      color: colors.text,
    },
    colors,
  };
}

/**
 * 布局配置
 */
const LAYOUTS = {
  // 标题页布局
  title_center: {
    title: { x: 0.5, y: "40%", w: "90%", h: 1, align: "center" },
    subtitle: { x: 0.5, y: "55%", w: "90%", h: 0.8, align: "center" },
  },
  title_left: {
    title: { x: 0.5, y: "40%", w: "90%", h: 1, align: "left" },
    subtitle: { x: 0.5, y: "55%", w: "90%", h: 0.8, align: "left" },
  },
  // 章节页布局
  section_center: {
    title: { x: 0.5, y: "45%", w: "90%", h: 1, align: "center" },
  },
  section_left: {
    title: { x: 0.5, y: "45%", w: "90%", h: 1, align: "left" },
  },
  // 要点页布局
  bullets_left: {
    heading: { x: 0.5, y: 0.5, w: "90%", h: 0.8, align: "left" },
    content: { x: 0.5, y: 1.5, w: "90%", h: 4, valign: "top" },
  },
  bullets_two_column: {
    heading: { x: 0.5, y: 0.5, w: "90%", h: 0.8, align: "left" },
    contentLeft: { x: 0.5, y: 1.5, w: "45%", h: 4, valign: "top" },
    contentRight: { x: "50%", y: 1.5, w: "45%", h: 4, valign: "top" },
  },
  // 文本页布局
  text_left: {
    heading: { x: 0.5, y: 0.5, w: "90%", h: 0.8, align: "left" },
    content: { x: 0.5, y: 1.5, w: "90%", h: 4, valign: "top" },
  },
  text_center: {
    heading: { x: 0.5, y: 0.5, w: "90%", h: 0.8, align: "center" },
    content: { x: 0.5, y: 1.5, w: "90%", h: 4, valign: "top", align: "center" },
  },
  text_two_column: {
    heading: { x: 0.5, y: 0.5, w: "90%", h: 0.8, align: "left" },
    contentLeft: { x: 0.5, y: 1.5, w: "45%", h: 4, valign: "top" },
    contentRight: { x: "50%", y: 1.5, w: "45%", h: 4, valign: "top" },
  },
  // 图表页布局（P1）
  chart_full: {
    heading: { x: 0.5, y: 0.3, w: "90%", h: 0.6, align: "left" },
    chart: { x: 0.5, y: 1.2, w: "90%", h: 4.5 },
  },
  chart_with_title: {
    heading: { x: 0.5, y: 0.5, w: "90%", h: 0.8, align: "left" },
    chart: { x: 0.5, y: 1.5, w: "90%", h: 4 },
  },
  // 表格页布局（P1）
  table_full: {
    heading: { x: 0.5, y: 0.3, w: "90%", h: 0.6, align: "left" },
    table: { x: 0.5, y: 1.2, w: "90%", h: 4.5 },
  },
  table_with_title: {
    heading: { x: 0.5, y: 0.5, w: "90%", h: 0.8, align: "left" },
    table: { x: 0.5, y: 1.5, w: "90%", h: 4 },
  },
};

/**
 * 获取布局配置
 * @param {string} type - 幻灯片类型
 * @param {string} layout - 布局名称
 * @returns {Object}
 */
function getLayout(type, layout) {
  // 如果指定了布局且存在，使用指定布局
  if (layout && LAYOUTS[layout]) {
    return LAYOUTS[layout];
  }
  // 否则使用类型默认布局
  const defaultLayouts = {
    title: LAYOUTS.title_center,
    section: LAYOUTS.section_center,
    bullets: LAYOUTS.bullets_left,
    text: LAYOUTS.text_left,
    chart: LAYOUTS.chart_with_title,
    table: LAYOUTS.table_with_title,
  };
  return defaultLayouts[type] || LAYOUTS.text_left;
}

/**
 * 创建标题页
 */
function createTitleSlide(pptx, slide, styles, theme) {
  const s = pptx.addSlide();
  const layout = getLayout("title", slide.layout);

  // 设置背景（如果主题有背景色）
  if (styles.colors.background !== "FFFFFF") {
    s.background = { color: styles.colors.background };
  }

  s.addText(slide.title || "", {
    ...layout.title,
    ...styles.title,
  });

  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      ...layout.subtitle,
      ...styles.subtitle,
    });
  }

  // 添加演讲者备注
  if (slide.notes) {
    s.addNotes(slide.notes);
  }
}

/**
 * 创建章节分隔页
 */
function createSectionSlide(pptx, slide, styles) {
  const s = pptx.addSlide();
  const layout = getLayout("section", slide.layout);

  if (styles.colors.background !== "FFFFFF") {
    s.background = { color: styles.colors.background };
  }

  s.addText(slide.title || "", {
    ...layout.title,
    ...styles.sectionTitle,
  });

  if (slide.notes) {
    s.addNotes(slide.notes);
  }
}

/**
 * 创建要点列表页
 */
function createBulletsSlide(pptx, slide, styles) {
  const s = pptx.addSlide();
  const layout = getLayout("bullets", slide.layout);

  if (styles.colors.background !== "FFFFFF") {
    s.background = { color: styles.colors.background };
  }

  s.addText(slide.title || "", {
    ...layout.heading,
    ...styles.heading,
  });

  // 兼容 items 和 bullets 字段
  const items = slide.items || slide.bullets || [];

  if (items.length > 0) {
    // 检查是否是两列布局
    if (slide.layout === "bullets_two_column" && items.length > 3) {
      const midPoint = Math.ceil(items.length / 2);
      const leftItems = items.slice(0, midPoint);
      const rightItems = items.slice(midPoint);

      // 左列
      const leftBullets = leftItems.map((item) => ({
        text: item,
        options: { bullet: true, ...styles.bullet },
      }));
      s.addText(leftBullets, {
        ...layout.contentLeft,
      });

      // 右列
      const rightBullets = rightItems.map((item) => ({
        text: item,
        options: { bullet: true, ...styles.bullet },
      }));
      s.addText(rightBullets, {
        ...layout.contentRight,
      });
    } else {
      const bulletItems = items.map((item) => ({
        text: item,
        options: { bullet: true, ...styles.bullet },
      }));
      s.addText(bulletItems, {
        ...layout.content,
      });
    }
  }

  if (slide.notes) {
    s.addNotes(slide.notes);
  }
}

/**
 * 创建纯文本内容页
 */
function createTextSlide(pptx, slide, styles) {
  const s = pptx.addSlide();
  const layout = getLayout("text", slide.layout);

  if (styles.colors.background !== "FFFFFF") {
    s.background = { color: styles.colors.background };
  }

  s.addText(slide.title || "", {
    ...layout.heading,
    ...styles.heading,
  });

  if (slide.content) {
    // 检查是否是两列布局（内容用 ||| 分隔）
    if (slide.layout === "text_two_column" && slide.content.includes("|||")) {
      const [leftContent, rightContent] = slide.content.split("|||");
      s.addText(leftContent.trim(), {
        ...layout.contentLeft,
        ...styles.body,
      });
      s.addText(rightContent.trim(), {
        ...layout.contentRight,
        ...styles.body,
      });
    } else {
      s.addText(slide.content, {
        ...layout.content,
        ...styles.body,
      });
    }
  }

  if (slide.notes) {
    s.addNotes(slide.notes);
  }
}

/**
 * 图表类型映射（DSL 类型 -> PptxGenJS 类型）
 */
const CHART_TYPE_MAP = {
  bar: "bar",
  bar3D: "bar3D",
  line: "line",
  pie: "pie",
  doughnut: "doughnut",
  area: "area",
  scatter: "scatter",
  radar: "radar",
};

/**
 * 创建图表页（P1）
 * 支持 PptxGenJS 原生图表渲染
 */
function createChartSlide(pptx, slide, styles) {
  const s = pptx.addSlide();
  const layout = getLayout("chart", slide.layout);

  if (styles.colors.background !== "FFFFFF") {
    s.background = { color: styles.colors.background };
  }

  s.addText(slide.title || "", {
    ...layout.heading,
    ...styles.heading,
  });

  // P1: 实现真正的图表渲染
  if (slide.chartData && slide.chartData.labels && slide.chartData.series) {
    try {
      // 确定图表类型
      const chartType = CHART_TYPE_MAP[slide.chartType] || "bar";

      // 转换数据为 PptxGenJS 格式
      const chartData = convertChartData(slide.chartData, chartType);

      // 图表配置
      const chartOptions = {
        x: layout.chart?.x || 0.5,
        y: layout.chart?.y || 1.5,
        w: typeof layout.chart?.w === "string" ? 9 : layout.chart?.w || 9,
        h: layout.chart?.h || 4,
        chartColors: [
          styles.colors.primary,
          styles.colors.secondary,
          styles.colors.accent,
          "4CAF50",
          "FF9800",
          "9C27B0",
        ],
        showLegend: slide.chartData.series.length > 1,
        legendPos: "b",
        showTitle: false,
        showValue: slide.showValues !== false,
        valAxisTitle: slide.chartData.yAxisTitle || "",
        catAxisTitle: slide.chartData.xAxisTitle || "",
      };

      // 饼图特殊配置
      if (chartType === "pie" || chartType === "doughnut") {
        chartOptions.showPercent = true;
        chartOptions.showValue = false;
        if (chartType === "doughnut") {
          chartOptions.holeSize = 50;
        }
      }

      // 添加图表
      s.addChart(pptx.ChartType[chartType], chartData, chartOptions);
    } catch (error) {
      // 渲染失败时降级为文本
      console.error("[pptx-generator] Chart render error:", error.message);
      s.addText(`图表渲染失败: ${error.message}`, {
        x: layout.chart?.x || 0.5,
        y: layout.chart?.y || 1.5,
        w: "90%",
        h: 4,
        ...styles.body,
        align: "center",
        valign: "middle",
        color: "CC0000",
      });
    }
  } else {
    // 无数据时显示占位符
    s.addText("(图表数据未提供)", {
      x: layout.chart?.x || 0.5,
      y: layout.chart?.y || 1.5,
      w: "90%",
      h: 4,
      ...styles.body,
      align: "center",
      valign: "middle",
      color: styles.colors.textLight,
    });
  }

  if (slide.notes) {
    s.addNotes(slide.notes);
  }
}

/**
 * 转换图表数据为 PptxGenJS 格式
 * @param {Object} chartData - DSL 图表数据
 * @param {string} chartType - 图表类型
 * @returns {Array} PptxGenJS 格式的数据
 */
function convertChartData(chartData, chartType) {
  const { labels, series } = chartData;

  // 饼图只用第一个 series
  if (chartType === "pie" || chartType === "doughnut") {
    const firstSeries = series[0] || { data: [] };
    return [
      {
        name: firstSeries.name || "数据",
        labels: labels,
        values: firstSeries.data,
      },
    ];
  }

  // 其他图表类型支持多 series
  return series.map((s) => ({
    name: s.name || "系列",
    labels: labels,
    values: s.data,
  }));
}

/**
 * 创建表格页（P1）
 * 暂时降级为文本页
 */
function createTableSlide(pptx, slide, styles) {
  const s = pptx.addSlide();
  const layout = getLayout("table", slide.layout);

  if (styles.colors.background !== "FFFFFF") {
    s.background = { color: styles.colors.background };
  }

  s.addText(slide.title || "", {
    ...layout.heading,
    ...styles.heading,
  });

  // P1: 实现真正的表格渲染
  if (slide.tableData && slide.tableData.headers && slide.tableData.rows) {
    // 构建简单表格
    const tableRows = [
      slide.tableData.headers.map((h) => ({
        text: h,
        options: { bold: true, fill: styles.colors.primary, color: "FFFFFF" },
      })),
      ...slide.tableData.rows.map((row) =>
        row.map((cell) => ({
          text: cell,
          options: { color: styles.colors.text },
        }))
      ),
    ];

    s.addTable(tableRows, {
      x: layout.table?.x || 0.5,
      y: layout.table?.y || 1.5,
      w: "90%",
      colW: Array(slide.tableData.headers.length).fill(
        9 / slide.tableData.headers.length
      ),
      border: { pt: 1, color: styles.colors.textLight },
      fontFace: "Arial",
      fontSize: 14,
    });
  } else {
    s.addText("(表格内容待实现)", {
      ...layout.table,
      ...styles.body,
      align: "center",
      valign: "middle",
    });
  }

  if (slide.notes) {
    s.addNotes(slide.notes);
  }
}

/**
 * 创建附录页（Sources Appendix）
 * 汇总所有幻灯片中的引用来源
 */
function createAppendixSlide(pptx, sources, styles) {
  if (!sources || sources.length === 0) return;

  const s = pptx.addSlide();

  if (styles.colors.background !== "FFFFFF") {
    s.background = { color: styles.colors.background };
  }

  // 附录标题
  s.addText("参考资料", {
    x: 0.5,
    y: 0.5,
    w: "90%",
    h: 0.8,
    ...styles.sectionTitle,
  });

  // 来源列表
  const sourceItems = sources.map((source, index) => {
    let text = `[${source.id || index + 1}] ${source.title || "未知来源"}`;
    if (source.url) {
      text += `\n    ${source.url}`;
    }
    if (source.excerpt) {
      const excerptPreview =
        source.excerpt.length > 100
          ? source.excerpt.slice(0, 100) + "..."
          : source.excerpt;
      text += `\n    "${excerptPreview}"`;
    }
    return {
      text: text,
      options: {
        bullet: false,
        fontSize: 14,
        color: styles.colors.text,
        paraSpaceAfter: 12,
      },
    };
  });

  s.addText(sourceItems, {
    x: 0.5,
    y: 1.5,
    w: "90%",
    h: 4.5,
    valign: "top",
  });

  // 添加备注说明
  s.addNotes("此页汇总了演示文稿中引用的所有参考资料。");
}

/**
 * 从幻灯片中收集所有来源
 * @param {Array} slides - 幻灯片数组
 * @param {Object} appendix - 附录对象
 * @returns {Array} 去重后的来源数组
 */
function collectAllSources(slides, appendix) {
  const sourceMap = new Map();

  // 从幻灯片收集
  if (slides) {
    slides.forEach((slide) => {
      if (slide.sources && Array.isArray(slide.sources)) {
        slide.sources.forEach((source) => {
          if (source.id && !sourceMap.has(source.id)) {
            sourceMap.set(source.id, source);
          }
        });
      }
    });
  }

  // 从附录收集（优先级更高，可能包含更完整的信息）
  if (appendix?.sources && Array.isArray(appendix.sources)) {
    appendix.sources.forEach((source) => {
      if (source.id) {
        // 如果已存在，合并信息（附录信息优先）
        const existing = sourceMap.get(source.id);
        sourceMap.set(source.id, {
          ...existing,
          ...source,
        });
      } else {
        // 无 id 的来源，生成临时 id
        const tempId = `S${sourceMap.size + 1}`;
        sourceMap.set(tempId, { ...source, id: tempId });
      }
    });
  }

  return Array.from(sourceMap.values());
}

/**
 * 生成 PowerPoint 文档
 * @param {Object} data - 演示文稿数据
 * @param {string} data.theme - 主题名称
 * @param {Array} data.slides - 幻灯片数组
 * @param {Object} data.appendix - 附录对象（可选）
 * @param {boolean} data.includeAppendix - 是否包含附录页（默认 true）
 * @returns {Promise<Buffer>} PPTX 文件 Buffer
 */
async function generatePptx(data) {
  const {
    slides,
    theme = "default_blue",
    title,
    appendix,
    includeAppendix = true,
  } = data;
  const pptx = new PptxGenJS();

  // 获取主题样式
  const styles = getThemeStyles(theme);

  pptx.author = "Alata Studio";
  pptx.company = "Alata Studio";
  pptx.subject = title || "演示文稿";

  // 设置主题颜色（用于图表等）
  pptx.theme = {
    colors: {
      accent1: styles.colors.primary,
      accent2: styles.colors.secondary,
      accent3: styles.colors.accent,
    },
  };

  for (const slide of slides) {
    switch (slide.type) {
      case "title":
        createTitleSlide(pptx, slide, styles, theme);
        break;
      case "section":
        createSectionSlide(pptx, slide, styles);
        break;
      case "bullets":
        createBulletsSlide(pptx, slide, styles);
        break;
      case "text":
        createTextSlide(pptx, slide, styles);
        break;
      case "chart":
        createChartSlide(pptx, slide, styles);
        break;
      case "table":
        createTableSlide(pptx, slide, styles);
        break;
      default:
        // 默认作为文本页处理
        createTextSlide(pptx, slide, styles);
    }
  }

  // P1: 添加附录页（汇总所有来源）
  if (includeAppendix) {
    const allSources = collectAllSources(slides, appendix);
    if (allSources.length > 0) {
      createAppendixSlide(pptx, allSources, styles);
    }
  }

  // 返回 Buffer
  const output = await pptx.write({ outputType: "nodebuffer" });
  return output;
}

/**
 * PptxGenerator AgentPlugin
 */
const pptxGenerator = {
  name: "generate-presentation",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          tracker: new Deduplicator(),
          name: this.name,
          description: `【内部渲染工具】将 PPT DSL 渲染为 .pptx 文件。
⚠️ 注意：用户请求生成 PPT 时，请使用 ppt-outline-flow 工具，而不是直接调用此工具。
此工具仅在以下情况使用：
- ppt-generate-flow 确认后的最终渲染
- 用户明确提供了完整的 slides 结构数据
- 需要快速生成简单 PPT（无需大纲确认流程）`,
          examples: [
            {
              prompt: "帮我生成Q4工作汇报PPT",
              call: JSON.stringify({
                filename: "Q4工作汇报.pptx",
                theme: "default_blue",
                slides: [
                  {
                    type: "title",
                    layout: "title_center",
                    title: "Q4工作汇报",
                    subtitle: "市场部 - 2024年12月",
                  },
                  { type: "section", title: "第一部分：业绩回顾" },
                  {
                    type: "bullets",
                    layout: "bullets_left",
                    title: "主要成果",
                    items: ["营收增长30%", "新增客户50家", "市场占有率提升5%"],
                    notes: "强调增长数据来源于Q4财报",
                  },
                  {
                    type: "text",
                    title: "总结",
                    content: "本季度团队表现优异，超额完成目标。",
                  },
                ],
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              filename: {
                type: "string",
                description: "文件名（含.pptx后缀）",
              },
              theme: {
                type: "string",
                enum: [
                  "default_blue",
                  "default_dark",
                  "default_light",
                  "corporate",
                ],
                default: "default_blue",
                description: "主题配色",
              },
              slides: {
                type: "array",
                description: "幻灯片数组",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: [
                        "title",
                        "section",
                        "bullets",
                        "text",
                        "chart",
                        "table",
                      ],
                      description: "幻灯片类型",
                    },
                    layout: {
                      type: "string",
                      description: "布局类型（可选）",
                    },
                    title: { type: "string", description: "标题" },
                    subtitle: {
                      type: "string",
                      description: "副标题（仅title类型）",
                    },
                    items: {
                      type: "array",
                      items: { type: "string" },
                      description: "要点列表（仅bullets类型）",
                    },
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                      description: "要点列表（与items等效）",
                    },
                    content: {
                      type: "string",
                      description: "文本内容（仅text类型）",
                    },
                    notes: { type: "string", description: "演讲者备注" },
                    chartType: {
                      type: "string",
                      enum: ["bar", "line", "pie"],
                      description: "图表类型（仅chart类型）",
                    },
                    chartData: {
                      type: "object",
                      description: "图表数据（仅chart类型）",
                    },
                    tableData: {
                      type: "object",
                      description: "表格数据（仅table类型）",
                    },
                    sources: {
                      type: "array",
                      description: "引用来源",
                    },
                  },
                  required: ["type", "title"],
                },
              },
            },
            required: ["filename", "slides"],
            additionalProperties: false,
          },
          handler: async function (args) {
            try {
              const { filename, slides, theme = "default_blue" } = args;

              if (this.tracker.isDuplicate(this.name, { filename })) {
                this.super.skipHandleExecution = true;
                return `✅ **PPT 已生成**\n\nPPT 演示文稿《${filename}》已成功生成，文件已自动下载到您的浏览器。`;
              }

              this.super.introspect(`正在生成PPT：${filename}...`);

              const buffer = await generatePptx({
                slides,
                theme,
                title: filename.replace(".pptx", ""),
              });
              const base64 = buffer.toString("base64");

              this.super.socket.send("fileDownload", {
                filename,
                b64Content: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}`,
              });

              this.super.introspect(`PPT ${filename} 已生成，正在下载...`);
              this.tracker.trackRun(this.name, { filename });

              // 设置 directOutput，终止循环
              this.super.skipHandleExecution = true;
              return `✅ **PPT 已生成**\n\nPPT 演示文稿《${filename}》已成功生成（主题：${theme}），文件已自动下载到您的浏览器。\n\n💡 **提示**：您可以在 PowerPoint 中打开文件，点击「设计」→「主题」套用公司模板。`;
            } catch (error) {
              this.super.handlerProps.log(
                `generate-presentation error: ${error.message}`
              );
              return `生成PPT时出错：${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = {
  pptxGenerator,
  generatePptx,
  // Export for use by ppt-generate-flow
  THEME_COLORS,
  LAYOUTS,
  getThemeStyles,
  getLayout,
  // P1: 附录页相关
  createAppendixSlide,
  collectAllSources,
};
