/**
 * Excel Generator Plugin
 *
 * 用于生成 Excel 电子表格 (.xlsx)
 * 支持多工作表、表头样式、数据格式化
 */

const { Deduplicator } = require("../utils/dedupe");
const ExcelJS = require("exceljs");

/**
 * 默认样式配置
 */
const DEFAULT_STYLES = {
  header: {
    font: { bold: true, size: 12, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } },
    alignment: { horizontal: "center", vertical: "middle" },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    },
  },
  cell: {
    font: { size: 11 },
    alignment: { vertical: "middle" },
    border: {
      top: { style: "thin", color: { argb: "FFD9D9D9" } },
      left: { style: "thin", color: { argb: "FFD9D9D9" } },
      bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
      right: { style: "thin", color: { argb: "FFD9D9D9" } },
    },
  },
};

/**
 * 生成 Excel 文档
 * @param {Object} data - 表格数据
 * @returns {Promise<Buffer>} Excel 文件 Buffer
 */
async function generateXlsx(data) {
  const { sheets } = data;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Alata Studio";
  workbook.created = new Date();

  for (const sheetData of sheets) {
    const { name, headers, rows, columnWidths } = sheetData;
    const worksheet = workbook.addWorksheet(name || "Sheet1");

    // 添加表头
    if (headers && headers.length > 0) {
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        Object.assign(cell, DEFAULT_STYLES.header);
        cell.font = DEFAULT_STYLES.header.font;
        cell.fill = DEFAULT_STYLES.header.fill;
        cell.alignment = DEFAULT_STYLES.header.alignment;
        cell.border = DEFAULT_STYLES.header.border;
      });
      headerRow.height = 25;
    }

    // 添加数据行
    if (rows && rows.length > 0) {
      for (const rowData of rows) {
        const row = worksheet.addRow(rowData);
        row.eachCell((cell) => {
          cell.font = DEFAULT_STYLES.cell.font;
          cell.alignment = DEFAULT_STYLES.cell.alignment;
          cell.border = DEFAULT_STYLES.cell.border;
        });
      }
    }

    // 设置列宽
    if (columnWidths && columnWidths.length > 0) {
      columnWidths.forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
      });
    } else {
      // 自动调整列宽
      worksheet.columns.forEach((column) => {
        let maxLength = 10;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const cellLength = cell.value ? String(cell.value).length : 0;
          // 中文字符按2个宽度计算
          const chineseChars = (
            String(cell.value || "").match(/[\u4e00-\u9fa5]/g) || []
          ).length;
          const adjustedLength = cellLength + chineseChars;
          if (adjustedLength > maxLength) {
            maxLength = adjustedLength;
          }
        });
        column.width = Math.min(maxLength + 2, 50);
      });
    }
  }

  return await workbook.xlsx.writeBuffer();
}

/**
 * XlsxGenerator AgentPlugin
 */
const xlsxGenerator = {
  name: "generate-excel-report",
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
          description: `生成 Excel 电子表格文件 (.xlsx)。
支持功能：
- 多工作表
- 表头样式（加粗、蓝色背景）
- 自动列宽调整
当用户要求导出表格、生成报表、下载Excel时调用此工具。`,
          examples: [
            {
              prompt: "帮我生成一个销售报表Excel",
              call: JSON.stringify({
                filename: "销售报表.xlsx",
                sheets: [
                  {
                    name: "Q4销售数据",
                    headers: ["产品", "数量", "单价", "金额"],
                    rows: [
                      ["产品A", 100, 50, 5000],
                      ["产品B", 200, 40, 8000],
                      ["合计", 300, "-", 13000],
                    ],
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
                description: "文件名（含.xlsx后缀）",
              },
              sheets: {
                type: "array",
                description: "工作表数组",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "工作表名称" },
                    headers: {
                      type: "array",
                      items: { type: "string" },
                      description: "表头数组",
                    },
                    rows: {
                      type: "array",
                      items: { type: "array" },
                      description: "数据行（二维数组）",
                    },
                    columnWidths: {
                      type: "array",
                      items: { type: "number" },
                      description: "列宽数组（可选）",
                    },
                  },
                  required: ["name", "headers", "rows"],
                },
              },
            },
            required: ["filename", "sheets"],
            additionalProperties: false,
          },
          handler: async function (args) {
            try {
              const { filename, sheets } = args;

              if (this.tracker.isDuplicate(this.name, { filename })) {
                this.super.skipHandleExecution = true;
                return `✅ **Excel 已生成**\n\nExcel 表格《${filename}》已成功生成，文件已自动下载到您的浏览器。`;
              }

              this.super.introspect(`正在生成Excel表格：${filename}...`);

              const buffer = await generateXlsx({ sheets });
              const base64 = buffer.toString("base64");

              this.super.socket.send("fileDownload", {
                filename,
                b64Content: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`,
              });

              this.super.introspect(`Excel ${filename} 已生成，正在下载...`);
              this.tracker.trackRun(this.name, { filename });

              // 设置 directOutput，终止循环
              this.super.skipHandleExecution = true;
              return `✅ **Excel 已生成**\n\nExcel 表格《${filename}》已成功生成，文件已自动下载到您的浏览器。\n\n如需修改数据或添加更多工作表，请告诉我。`;
            } catch (error) {
              this.super.handlerProps.log(
                `generate-excel-report error: ${error.message}`
              );
              return `生成Excel时出错：${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = { xlsxGenerator, generateXlsx };
