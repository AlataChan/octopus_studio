/**
 * LangChain 工具集成入口
 *
 * @description
 * 提供预配置的 LangChain 工具，已转换为 AIbitat 插件格式。
 * 这些工具可以直接通过 aibitat.use() 注册使用。
 *
 * 使用示例：
 * ```javascript
 * const { calculatorTool, serpApiTool } = require('./langchain-tools');
 * aibitat.use(calculatorTool.plugin());
 * ```
 */

const LangChainWrapper = require("../langchain-wrapper");

/**
 * 计算器工具
 * 使用 LangChain 的 Calculator 工具进行数学计算
 */
const calculatorTool = {
  name: "calculator",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Useful for performing mathematical calculations. Input should be a valid mathematical expression.",
          examples: [
            {
              prompt: "What is 25 * 4 + 10?",
              call: JSON.stringify({ expression: "25 * 4 + 10" }),
            },
            {
              prompt: "Calculate the square root of 144",
              call: JSON.stringify({ expression: "Math.sqrt(144)" }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              expression: {
                type: "string",
                description: "The mathematical expression to evaluate",
              },
            },
            required: ["expression"],
            additionalProperties: false,
          },
          handler: async function ({ expression }) {
            try {
              this.super.introspect(
                `${this.caller}: Calculating "${expression}"...`
              );

              // 安全的数学表达式求值
              // 注意：生产环境应使用更安全的数学解析库如 mathjs
              const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
              const result = Function(`"use strict"; return (${sanitized})`)();

              this.super.introspect(
                `${this.caller}: Calculation result: ${result}`
              );

              return String(result);
            } catch (error) {
              return `Calculation error: ${error.message}`;
            }
          },
        });
      },
    };
  },
};

/**
 * JSON 解析工具
 * 解析和格式化 JSON 数据
 */
const jsonParserTool = {
  name: "json-parser",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Parse, validate, and format JSON data. Can extract specific fields or pretty-print JSON.",
          examples: [
            {
              prompt: 'Parse this JSON: {"name": "test"}',
              call: JSON.stringify({
                action: "parse",
                input: '{"name": "test"}',
              }),
            },
            {
              prompt: "Format this JSON nicely",
              call: JSON.stringify({
                action: "format",
                input: '{"a":1,"b":2}',
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["parse", "format", "validate", "extract"],
                description: "The action to perform on the JSON",
              },
              input: {
                type: "string",
                description: "The JSON string to process",
              },
              path: {
                type: "string",
                description:
                  "JSON path for extraction (e.g., 'data.items[0].name')",
              },
            },
            required: ["action", "input"],
            additionalProperties: false,
          },
          handler: async function ({ action, input, path }) {
            try {
              const parsed = JSON.parse(input);

              switch (action) {
                case "parse":
                  return JSON.stringify(parsed);
                case "format":
                  return JSON.stringify(parsed, null, 2);
                case "validate":
                  return "Valid JSON";
                case "extract":
                  if (!path) return "Path required for extraction";
                  const value = path
                    .split(".")
                    .reduce((obj, key) => obj?.[key], parsed);
                  return JSON.stringify(value);
                default:
                  return "Unknown action";
              }
            } catch (error) {
              return `JSON error: ${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = {
  calculatorTool,
  jsonParserTool,
  LangChainWrapper,
};
