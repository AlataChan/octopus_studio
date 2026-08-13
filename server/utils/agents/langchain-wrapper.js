/**
 * LangChain 工具包装器
 *
 * @description
 * 将 LangChain 工具转换为 AIbitat 插件格式，
 * 实现工具生态的互操作性，无需修改现有架构。
 *
 * 设计原则：
 * 1. 适配器模式：LangChain 工具 → AIbitat 插件
 * 2. 保持类型安全：转换 Zod Schema → JSON Schema
 * 3. 错误隔离：LangChain 错误不影响 AIbitat 主流程
 */

const { Deduplicator } = require("./aibitat/utils/dedupe");

/**
 * LangChain 工具到 AIbitat 插件的包装器类
 */
class LangChainWrapper {
  /**
   * 将 LangChain StructuredTool 转换为 AIbitat 插件
   *
   * @param {Object} langchainTool - LangChain StructuredTool 实例
   * @param {Object} options - 配置选项
   * @param {string} options.name - 插件名称（可选，默认使用工具名称）
   * @param {string} options.description - 插件描述（可选）
   * @param {Array} options.examples - 使用示例（可选）
   * @returns {Object} AIbitat 插件配置
   */
  static wrapStructuredTool(langchainTool, options = {}) {
    const toolName = options.name || langchainTool.name || "langchain-tool";
    const toolDescription =
      options.description ||
      langchainTool.description ||
      `LangChain tool: ${toolName}`;

    return {
      name: toolName,
      startupConfig: {
        params: options.params || {},
      },
      plugin: function (runtimeArgs = {}) {
        return {
          name: toolName,
          setup(aibitat) {
            aibitat.function({
              super: aibitat,
              name: toolName,
              tracker: new Deduplicator(),
              description: toolDescription,
              examples: options.examples || [],
              parameters: LangChainWrapper.convertSchema(langchainTool.schema),
              handler: async function (args = {}) {
                try {
                  this.super.introspect(
                    `${this.caller}: Executing LangChain tool "${toolName}"...`
                  );

                  // 调用 LangChain 工具
                  const result = await langchainTool.invoke(args);

                  this.super.introspect(
                    `${this.caller}: LangChain tool "${toolName}" completed.`
                  );

                  return typeof result === "object"
                    ? JSON.stringify(result)
                    : String(result);
                } catch (error) {
                  console.error(
                    `[LangChainWrapper] Tool ${toolName} failed:`,
                    error
                  );
                  this.super.introspect(
                    `${this.caller}: LangChain tool "${toolName}" failed: ${error.message}`
                  );
                  return `Tool execution failed: ${error.message}`;
                }
              },
            });
          },
        };
      },
    };
  }

  /**
   * 批量包装多个 LangChain 工具
   *
   * @param {Array} tools - LangChain 工具数组
   * @param {Object} commonOptions - 公共配置选项
   * @returns {Array} AIbitat 插件数组
   */
  static wrapTools(tools, commonOptions = {}) {
    return tools.map((tool) => {
      const toolOptions = {
        ...commonOptions,
        name: tool.name,
        description: tool.description,
      };
      return LangChainWrapper.wrapStructuredTool(tool, toolOptions);
    });
  }

  /**
   * 将 Zod Schema 或 LangChain Schema 转换为 JSON Schema
   *
   * @param {Object} schema - Zod Schema 或已转换的 JSON Schema
   * @returns {Object} JSON Schema 格式
   */
  static convertSchema(schema) {
    // 如果已经是 JSON Schema 格式，直接返回
    if (schema && schema.$schema) {
      return schema;
    }

    // 如果是 Zod Schema，尝试转换
    if (schema && typeof schema.parse === "function") {
      return LangChainWrapper.zodToJsonSchema(schema);
    }

    // 如果有 shape 属性（Zod object），转换
    if (schema && schema._def && schema._def.shape) {
      return LangChainWrapper.zodToJsonSchema(schema);
    }

    // 如果是普通对象，假设它是 properties 定义
    if (schema && typeof schema === "object") {
      return {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: schema.properties || schema,
        required: schema.required || [],
        additionalProperties: false,
      };
    }

    // 默认返回空 schema
    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {},
      additionalProperties: false,
    };
  }

  /**
   * 简化的 Zod 到 JSON Schema 转换
   * 注意：这是一个简化实现，复杂场景建议使用 zod-to-json-schema 库
   *
   * @param {Object} zodSchema - Zod Schema
   * @returns {Object} JSON Schema
   */
  static zodToJsonSchema(zodSchema) {
    const properties = {};
    const required = [];

    try {
      // 获取 Zod 对象的 shape
      const shape = zodSchema._def?.shape?.() || zodSchema._def?.shape || {};

      for (const [key, value] of Object.entries(shape)) {
        const typeName = value?._def?.typeName;

        // 基础类型映射
        const typeMap = {
          ZodString: "string",
          ZodNumber: "number",
          ZodBoolean: "boolean",
          ZodArray: "array",
          ZodObject: "object",
        };

        properties[key] = {
          type: typeMap[typeName] || "string",
          description: value._def?.description || `Parameter: ${key}`,
        };

        // 检查是否必需
        if (!value.isOptional?.()) {
          required.push(key);
        }
      }
    } catch (error) {
      console.warn("[LangChainWrapper] Zod schema conversion failed:", error);
    }

    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }
}

module.exports = LangChainWrapper;
