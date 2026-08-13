const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { FlowExecutor, FLOW_TYPES } = require("./executor");
const { normalizePath } = require("../files");
const { safeJsonParse } = require("../http");

/**
 * 验证 UUID v4 格式
 * @param {string} uuid - 待验证的 UUID
 * @returns {boolean} 是否为有效的 UUID v4 格式
 */
function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== "string") return false;
  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(uuid);
}

/**
 * @typedef {Object} LoadedFlow
 * @property {string} name - The name of the flow
 * @property {string} uuid - The UUID of the flow
 * @property {Object} config - The flow configuration details
 * @property {string} config.description - The description of the flow
 * @property {Array<{type: string, config: Object, [key: string]: any}>} config.steps - The steps of the flow. Each step has at least a type and config
 */

class AgentFlows {
  static flowsDir = process.env.STORAGE_DIR
    ? path.join(process.env.STORAGE_DIR, "plugins", "agent-flows")
    : path.join(process.cwd(), "storage", "plugins", "agent-flows");

  constructor() {}

  /**
   * Ensure flows directory exists
   * @returns {Boolean} True if directory exists, false otherwise
   */
  static createOrCheckFlowsDir() {
    try {
      if (fs.existsSync(AgentFlows.flowsDir)) return true;
      fs.mkdirSync(AgentFlows.flowsDir, { recursive: true });
      return true;
    } catch (error) {
      console.error("Failed to create flows directory:", error);
      return false;
    }
  }

  /**
   * Helper to get all flow files with their contents
   * @returns {Object} Map of flow UUID to flow config
   */
  static getAllFlows() {
    AgentFlows.createOrCheckFlowsDir();
    const files = fs.readdirSync(AgentFlows.flowsDir);
    const flows = {};

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const filePath = path.join(AgentFlows.flowsDir, file);
        const content = fs.readFileSync(normalizePath(filePath), "utf8");
        const config = JSON.parse(content);
        const id = file.replace(".json", "");
        flows[id] = config;
      } catch (error) {
        console.error(`Error reading flow file ${file}:`, error);
      }
    }

    return flows;
  }

  /**
   * Load a flow configuration by UUID
   * @param {string} uuid - The UUID of the flow to load
   * @returns {LoadedFlow|null} Flow configuration or null if not found
   */
  static loadFlow(uuid) {
    try {
      // 防御纵深：验证 UUID 格式，防止路径遍历攻击
      if (!uuid || !isValidUUID(uuid)) {
        console.warn(`Invalid UUID format attempted: ${uuid}`);
        return null;
      }

      const flowJsonPath = normalizePath(
        path.join(AgentFlows.flowsDir, `${uuid}.json`)
      );
      if (!fs.existsSync(flowJsonPath)) return null;
      const flow = safeJsonParse(fs.readFileSync(flowJsonPath, "utf8"), null);
      if (!flow) return null;

      return {
        name: flow.name,
        uuid,
        config: flow,
      };
    } catch (error) {
      console.error("Failed to load flow:", error);
      return null;
    }
  }

  /**
   * Save a flow configuration
   * @param {string} name - The name of the flow
   * @param {Object} config - The flow configuration
   * @param {string|null} uuid - Optional UUID for the flow
   * @returns {Object} Result of the save operation
   */
  static saveFlow(name, config, uuid = null) {
    try {
      AgentFlows.createOrCheckFlowsDir();

      if (!uuid) uuid = uuidv4();
      const normalizedUuid = normalizePath(`${uuid}.json`);
      const filePath = path.join(AgentFlows.flowsDir, normalizedUuid);

      // Prevent saving flows with unsupported blocks or importing
      // flows with unsupported blocks (eg: file writing or code execution on Desktop importing to Docker)
      const supportedFlowTypes = Object.values(FLOW_TYPES).map(
        (definition) => definition.type
      );
      const supportsAllBlocks = config.steps.every((step) =>
        supportedFlowTypes.includes(step.type)
      );
      if (!supportsAllBlocks)
        throw new Error(
          "This flow includes unsupported blocks. They may not be supported by your version of Alata or are not available on this platform."
        );

      fs.writeFileSync(filePath, JSON.stringify({ ...config, name }, null, 2));
      return { success: true, uuid };
    } catch (error) {
      console.error("Failed to save flow:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List all available flows
   * @returns {Array} Array of flow summaries
   */
  static listFlows() {
    try {
      const flows = AgentFlows.getAllFlows();
      return Object.entries(flows).map(([uuid, flow]) => ({
        name: flow.name,
        uuid,
        description: flow.description,
        active: flow.active !== false,
      }));
    } catch (error) {
      console.error("Failed to list flows:", error);
      return [];
    }
  }

  /**
   * Delete a flow by UUID
   * @param {string} uuid - The UUID of the flow to delete
   * @returns {Object} Result of the delete operation
   */
  static deleteFlow(uuid) {
    try {
      // 防御纵深：验证 UUID 格式，防止路径遍历攻击
      if (!uuid || !isValidUUID(uuid)) {
        throw new Error(`Invalid UUID format: ${uuid}`);
      }

      const filePath = normalizePath(
        path.join(AgentFlows.flowsDir, `${uuid}.json`)
      );
      if (!fs.existsSync(filePath)) throw new Error(`Flow ${uuid} not found`);
      fs.rmSync(filePath);
      return { success: true };
    } catch (error) {
      console.error("Failed to delete flow:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a flow by UUID
   * @param {string} uuid - The UUID of the flow to execute
   * @param {Object} variables - Initial variables for the flow
   * @param {Object} aibitat - The aibitat instance from the agent handler
   * @returns {Promise<Object>} Result of flow execution
   */
  static async executeFlow(uuid, variables = {}, aibitat = null) {
    // 防御纵深：验证 UUID 格式
    if (!uuid || !isValidUUID(uuid)) {
      throw new Error(`Invalid UUID format: ${uuid}`);
    }

    const flow = AgentFlows.loadFlow(uuid);
    if (!flow) throw new Error(`Flow ${uuid} not found`);
    const flowExecutor = new FlowExecutor();
    return await flowExecutor.executeFlow(flow, variables, aibitat);
  }

  /**
   * Get all active flows as plugins that can be loaded into the agent
   * @returns {string[]} Array of flow names in @@flow_{uuid} format
   */
  static activeFlowPlugins() {
    const flows = AgentFlows.getAllFlows();
    return Object.entries(flows)
      .filter(([_, flow]) => flow.active !== false)
      .map(([uuid]) => `@@flow_${uuid}`);
  }

  /**
   * Load a flow plugin by its UUID
   * @param {string} uuid - The UUID of the flow to load
   * @returns {Object|null} Plugin configuration or null if not found
   */
  static loadFlowPlugin(uuid) {
    const flow = AgentFlows.loadFlow(uuid);
    if (!flow) return null;

    const startBlock = flow.config.steps?.find((s) => s.type === "start");
    const variables = startBlock?.config?.variables || [];

    return {
      name: `flow_${uuid}`,
      description: `Execute agent flow: ${flow.name}`,
      plugin: (_runtimeArgs = {}) => ({
        name: `flow_${uuid}`,
        description:
          flow.config.description || `Execute agent flow: ${flow.name}`,
        setup: (aibitat) => {
          aibitat.function({
            name: `flow_${uuid}`,
            description:
              flow.config.description || `Execute agent flow: ${flow.name}`,
            parameters: {
              type: "object",
              properties: variables.reduce((acc, v) => {
                if (v.name) {
                  acc[v.name] = {
                    type: "string",
                    description:
                      v.description || `Value for variable ${v.name}`,
                  };
                }
                return acc;
              }, {}),
            },
            handler: async (args) => {
              aibitat.introspect(`Executing flow: ${flow.name}`);
              console.log(
                `[AgentFlows] Starting flow ${flow.name} with args:`,
                JSON.stringify(args).substring(0, 200)
              );

              const result = await AgentFlows.executeFlow(uuid, args, aibitat);

              console.log(
                `[AgentFlows] Flow ${flow.name} completed. Success: ${result.success}, Steps: ${result.results?.length}, HasDirectOutput: ${!!result.directOutput}`
              );

              // 存储 Flow 执行的元数据，供 chat-history 插件使用
              if (result.metadata) {
                aibitat._lastFlowMetadata = result.metadata;
                console.log(
                  `[AgentFlows] Stored flow metadata: agentRoles=${result.metadata.agentRoles?.length || 0}`
                );
              }

              if (!result.success) {
                const errorMsg = result.results?.[0]?.error || "Unknown error";
                console.log(`[AgentFlows] Flow failed:`, errorMsg);
                aibitat.introspect(`Flow failed: ${errorMsg}`);
                return `Flow execution failed: ${errorMsg}`;
              }
              aibitat.introspect(`${flow.name} completed successfully`);

              // Flow 执行完毕后的处理策略（方案 C + D 混合）：
              // 1. 检查用户原始请求是否包含输出格式需求（PPT/Excel/PDF/Word）
              // 2. 如果有，则不设置 skipHandleExecution，让 AI 继续调用输出工具
              // 3. 如果没有，则直接返回 Flow 结果

              const outputKeywords = {
                ppt: ["ppt", "PPT", "演示文稿", "幻灯片", "presentation"],
                excel: ["excel", "Excel", "EXCEL", "表格", "电子表格", "xlsx"],
                pdf: ["pdf", "PDF", "Pdf"],
                word: ["word", "Word", "WORD", "文档", "docx", "公文"],
              };

              // 获取用户原始请求
              const userMessage =
                args?.userMessage || aibitat._lastUserMessage || "";

              // 检测是否需要输出格式
              let requestedFormat = null;
              for (const [format, keywords] of Object.entries(outputKeywords)) {
                if (keywords.some((kw) => userMessage.includes(kw))) {
                  requestedFormat = format;
                  break;
                }
              }

              if (result.directOutput) {
                const outputContent =
                  typeof result.directOutput === "string"
                    ? result.directOutput
                    : AgentFlows.stringifyResult(result.directOutput);

                if (requestedFormat) {
                  // 用户请求了特定输出格式，不终止执行，让 AI 继续调用输出工具
                  console.log(
                    `[AgentFlows] Flow completed. User requested ${requestedFormat} format - allowing AI to continue with output tools`
                  );
                  console.log(
                    `[AgentFlows] directOutput preview:`,
                    outputContent.substring(0, 200)
                  );

                  // 返回结果但不设置 skipHandleExecution
                  // AI 会收到 Flow 结果，然后可以调用输出工具
                  return `【调研报告已完成】\n\n${outputContent}\n\n---\n\n请根据上述内容，按用户要求生成${requestedFormat.toUpperCase()}格式的文档。`;
                } else {
                  // 用户没有请求特定格式，直接返回结果
                  console.log(
                    `[AgentFlows] Flow has directOutput, no output format requested - returning directly`
                  );
                  console.log(
                    `[AgentFlows] directOutput preview:`,
                    outputContent.substring(0, 200)
                  );
                  aibitat.skipHandleExecution = true;
                  return outputContent;
                }
              }

              console.log(
                `[AgentFlows] Flow has NO directOutput, returning full result (this may cause LLM to call flow again!)`
              );
              console.log(
                `[AgentFlows] Result structure:`,
                JSON.stringify(result, null, 2).substring(0, 500)
              );
              return AgentFlows.stringifyResult(result);
            },
          });
        },
      }),
      flowName: flow.name,
    };
  }

  /**
   * Stringify the result of a flow execution or return the input as is
   * @param {Object|string} input - The result to stringify
   * @returns {string} The stringified result
   */
  static stringifyResult(input) {
    return typeof input === "object" ? JSON.stringify(input) : String(input);
  }
}

module.exports.AgentFlows = AgentFlows;
