/**
 * AgentOrchestrator - 多 Agent 编排器
 *
 * @description
 * AgentOrchestrator 是 Level 1 多 Agent 协作的核心类。
 * 它负责：
 * 1. 分析用户任务，判断是否需要多 Agent 协作
 * 2. 从可用的 Flow 和工具中选择最佳执行方案
 * 3. 协调多个 Agent/Flow 的执行顺序
 * 4. 管理共享上下文（Blackboard）
 * 5. 【新增】基于知识全景进行智能 Planning
 *
 * 设计原则：
 * - LLM 驱动的编排（而非硬编码规则）
 * - 与现有 AIbitat 引擎无缝集成
 * - 支持串行和简单并行执行
 * - 【新增】Planning 不在"信息真空"中盲目决策
 */

const Blackboard = require("../agentFlows/blackboard");
const AgentFlows = require("../agentFlows");
const {
  KnowledgeSensing,
  COVERAGE_LEVEL,
  isKnowledgeSensingEnabled,
} = require("./knowledgeSensing");
const { InvocationStep } = require("../../models/invocationStep");
const {
  WorkspaceAgentInvocation,
} = require("../../models/workspaceAgentInvocation");
const { createDebugTracer } = require("./debugTracer");

/**
 * 编排策略枚举
 */
const ORCHESTRATION_STRATEGY = {
  SINGLE: "single", // 单一 Agent/Flow 执行
  SEQUENTIAL: "sequential", // 串行执行多个 Flow
  PARALLEL: "parallel", // 并行执行（Level 1 暂不支持复杂并行）
  AUTO: "auto", // LLM 自动决定
};

/**
 * 任务复杂度级别
 */
const TASK_COMPLEXITY = {
  SIMPLE: "simple", // 简单任务，单工具可完成
  MODERATE: "moderate", // 中等复杂，可能需要 1 个 Flow
  COMPLEX: "complex", // 复杂任务，需要多 Agent 协作
};

class AgentOrchestrator {
  /**
   * 创建编排器实例
   * @param {Object} options - 配置选项
   * @param {Object} options.aibitat - AIbitat 实例
   * @param {Object} options.provider - LLM Provider 实例
   * @param {Function} options.introspect - 状态反馈函数
   * @param {Function} options.log - 日志函数
   * @param {number} [options.invocationId] - Invocation ID（用于记录步骤）
   * @param {string} [options.invocationUuid] - Invocation UUID（用于更新知识指标）
   */
  constructor(options = {}) {
    this.aibitat = options.aibitat;
    this.provider = options.provider;
    this.introspect = options.introspect || console.log;
    this.log = options.log || console.log;
    this.blackboard = new Blackboard();
    this.invocationId = options.invocationId || null;
    this.invocationUuid = options.invocationUuid || null;
    this.socket = options.socket || null; // Phase F: 保存 socket 用于发送 Planning 事件

    // Phase L: 调试追踪器
    this.debugTracer = createDebugTracer({
      socket: options.socket,
      log: this.log,
      invocationId: this.invocationId,
      enabled:
        options.enableDebugTracer ?? process.env.ENABLE_DEBUG_TRACER === "true",
    });
  }

  /**
   * 分析任务复杂度
   * @param {string} task - 用户任务描述
   * @returns {Object} 复杂度分析结果
   */
  analyzeTaskComplexity(task) {
    const complexityIndicators = {
      multiStep: [
        "首先",
        "然后",
        "接着",
        "最后",
        "第一步",
        "第二步",
        "分步",
        "步骤",
        "first",
        "then",
        "next",
        "finally",
        "step",
      ],
      research: [
        "调研",
        "研究",
        "分析",
        "对比",
        "比较",
        "评估",
        "research",
        "analyze",
        "compare",
        "evaluate",
      ],
      creation: [
        "撰写",
        "编写",
        "生成",
        "创建",
        "制作",
        "write",
        "create",
        "generate",
        "compose",
        "draft",
      ],
      review: [
        "审核",
        "检查",
        "校对",
        "优化",
        "改进",
        "review",
        "check",
        "proofread",
        "optimize",
        "improve",
      ],
    };

    const taskLower = task.toLowerCase();
    const scores = {
      multiStep: 0,
      research: 0,
      creation: 0,
      review: 0,
    };

    // 计算各维度得分
    for (const [category, keywords] of Object.entries(complexityIndicators)) {
      for (const keyword of keywords) {
        if (taskLower.includes(keyword.toLowerCase())) {
          scores[category]++;
        }
      }
    }

    // 计算总复杂度
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const categoryCount = Object.values(scores).filter((s) => s > 0).length;

    let complexity;
    if (totalScore <= 1 && categoryCount <= 1) {
      complexity = TASK_COMPLEXITY.SIMPLE;
    } else if (totalScore <= 3 || categoryCount <= 2) {
      complexity = TASK_COMPLEXITY.MODERATE;
    } else {
      complexity = TASK_COMPLEXITY.COMPLEX;
    }

    return {
      complexity,
      scores,
      totalScore,
      categoryCount,
      suggestedFlowCount: Math.min(categoryCount, 3), // 最多建议 3 个 Flow
    };
  }

  /**
   * 获取可用的 Flow 列表（带描述）
   * @returns {Array} Flow 信息列表
   */
  getAvailableFlows() {
    const flows = AgentFlows.getAllFlows();
    return Object.entries(flows)
      .filter(([_, flow]) => flow.active !== false)
      .map(([uuid, flow]) => ({
        uuid,
        name: flow.name,
        description: flow.config?.description || `Flow: ${flow.name}`,
        blockCount: flow.config?.steps?.length || 0,
        identifier: `@@flow_${uuid}`,
      }));
  }

  /**
   * 让 LLM 选择最佳执行方案（知识驱动版）
   * @param {string} task - 用户任务
   * @param {Array} availableFlows - 可用 Flow 列表
   * @param {Array} availableTools - 可用工具列表
   * @param {Object} workspace - Workspace 对象（新增，用于知识感知）
   * @returns {Promise<Object>} 执行方案
   */
  async selectExecutionPlan(
    task,
    availableFlows = [],
    availableTools = [],
    workspace = null
  ) {
    // Phase L: 追踪 Planning 开始
    this.debugTracer.tracePlanningStart({
      task,
      workspaceId: workspace?.id,
    });

    if (!this.provider) {
      this.debugTracer.tracePlanningEnd();
      return this.fallbackPlan(task, availableFlows, availableTools);
    }

    // 【新增】知识感知步骤（受 Feature Flag 控制）
    let knowledgeContext = null;
    const knowledgeStartTime = Date.now();
    if (workspace && isKnowledgeSensingEnabled()) {
      try {
        this.log("[Orchestrator] 执行知识感知...");
        knowledgeContext = await KnowledgeSensing.getKnowledgeContext({
          task,
          workspace,
          maxTokens: 3000,
        });
        this.log(
          `[Orchestrator] 知识覆盖度: ${knowledgeContext.coverage}, 图谱节点: ${knowledgeContext.metadata.graphNodes}, 文档来源: ${knowledgeContext.metadata.vectorSources}`
        );

        // Phase L: 追踪知识加载完成
        this.debugTracer.traceKnowledgeLoaded({
          coverage: knowledgeContext.coverage,
          graphNodes: knowledgeContext.metadata?.graphNodes || 0,
          vectorSources: knowledgeContext.metadata?.vectorSources || 0,
          durationMs: Date.now() - knowledgeStartTime,
        });
      } catch (error) {
        this.log(
          `[Orchestrator] 知识感知失败: ${error.message}，继续使用传统 Planning`
        );
        knowledgeContext = null;
      }
    } else if (workspace && !isKnowledgeSensingEnabled()) {
      this.log(
        "[Orchestrator] 知识感知已禁用 (ENABLE_KNOWLEDGE_SENSING=false)"
      );
    }

    const flowDescriptions = availableFlows
      .map((f) => `- ${f.identifier}: ${f.name} - ${f.description}`)
      .join("\n");

    const toolDescriptions = availableTools
      .slice(0, 10)
      .map((t) => `- ${t.name}: ${t.description || "No description"}`)
      .join("\n");

    // 【改进】Planning Prompt - 加入知识上下文
    const knowledgeSection = knowledgeContext
      ? `
## 知识库上下文

${knowledgeContext.summary}

### 知识覆盖度评估
- 覆盖等级: ${knowledgeContext.coverage}
- 图谱节点: ${knowledgeContext.metadata.graphNodes} 个
- 文档来源: ${knowledgeContext.metadata.vectorSources} 个

**规划建议**:
${
  knowledgeContext.coverage === COVERAGE_LEVEL.HIGH
    ? "- 知识库已充分覆盖，建议优先使用文档研究类 Flow 或 rag-memory 工具"
    : knowledgeContext.coverage === COVERAGE_LEVEL.MEDIUM
      ? "- 知识库部分覆盖，建议结合内部知识和外部搜索"
      : "- 知识库覆盖不足，建议使用互联网搜索或 API 调用"
}
`
      : "";

    const planningPrompt = `你是一个任务编排专家。根据用户任务和知识库上下文，选择最佳的执行方案。

## 用户任务
${task}
${knowledgeSection}
## 可用的 Agent Flow（预定义工作流）
${flowDescriptions || "暂无可用 Flow"}

## 可用的工具
${toolDescriptions || "暂无额外工具"}

## 输出格式
请返回 JSON 格式的执行方案：
{
  "strategy": "single|sequential",
  "reason": "选择此方案的原因，特别说明如何利用知识库",
  "knowledge_utilization": "high|medium|low|none",
  "steps": [
    {
      "type": "flow|tool|direct",
      "identifier": "@@flow_xxx 或工具名称",
      "purpose": "此步骤的目的"
    }
  ]
}

注意：
1. 如果知识库覆盖度高，优先使用 rag-memory 工具或文档研究类 Flow
2. 如果任务简单且知识库有答案，直接使用 "strategy": "single", "steps": [{"type": "direct"}]
3. 如果需要调用 Flow，使用完整的 @@flow_xxx 标识符
4. 最多返回 3 个步骤
`;

    try {
      const messages = [
        {
          role: "system",
          content:
            "你是一个任务编排专家，擅长分析任务并选择最佳执行方案。请特别关注知识库的覆盖情况。",
        },
        { role: "user", content: planningPrompt },
      ];

      const response = await this.provider.complete(messages);

      // provider.complete() 返回 { textResponse, ... } 或 { result }
      const result = response?.textResponse || response?.result || "";

      if (!result) {
        this.log(`[Orchestrator] LLM returned empty response`);
        return this.fallbackPlan(task, availableFlows, availableTools);
      }

      // 尝试解析 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        const planResult = {
          success: true,
          plan,
          knowledgeContext, // 【新增】返回知识上下文供后续使用
          raw: result,
        };

        // Phase L: 追踪 Planning 决策
        this.debugTracer.tracePlanningDecision({
          strategy: plan.strategy,
          reason: plan.reason,
          steps: plan.steps,
        });
        this.debugTracer.tracePlanningEnd();

        // 【新增】记录 Planning 决策
        await this._logPlanningDecision(task, plan, knowledgeContext);

        // Phase F: 发送 Planning 决策到前端（Planning 可视化）
        this._sendPlanningDecision(plan, knowledgeContext);

        return planResult;
      }

      this.log(
        `[Orchestrator] Failed to parse JSON from LLM response: ${result.substring(0, 200)}...`
      );
      this.debugTracer.tracePlanningEnd();
      return this.fallbackPlan(task, availableFlows, availableTools);
    } catch (error) {
      this.log(`[Orchestrator] LLM planning failed: ${error.message}`);
      this.debugTracer.traceDiagnostic({
        level: "error",
        message: `Planning failed: ${error.message}`,
      });
      this.debugTracer.tracePlanningEnd();
      return this.fallbackPlan(task, availableFlows, availableTools);
    }
  }

  /**
   * 记录 Planning 决策（可观测性）
   * @private
   */
  async _logPlanningDecision(task, plan, knowledgeContext) {
    try {
      // 使用 InvocationStep 模型记录 Planning 决策
      if (this.invocationId) {
        // 将 plan 和 knowledge metadata 合并到 output_summary（schema 无 metadata 字段）
        const outputData = {
          strategy: plan.strategy,
          steps: plan.steps?.length || 0,
          knowledge_utilization: plan.knowledge_utilization || "none",
          knowledge_coverage: knowledgeContext?.coverage || "none",
          graph_nodes: knowledgeContext?.metadata?.graphNodes || 0,
          vector_sources: knowledgeContext?.metadata?.vectorSources || 0,
          processing_time_ms: knowledgeContext?.metadata?.processingTimeMs || 0,
        };

        await InvocationStep.create({
          invocation_id: this.invocationId,
          step_index: 0, // Planning 始终是第 0 步
          step_type: "planning_decision",
          tool_name: "orchestrator",
          input_summary: task.slice(0, 500),
          output_summary: JSON.stringify(outputData).slice(0, 1000),
          success: true,
          duration_ms: knowledgeContext?.metadata?.processingTimeMs || 0,
        });
        this.log("[Orchestrator] Planning 决策已记录");
      }

      // 【新增】更新 Invocation 的知识指标
      if (this.invocationUuid && knowledgeContext) {
        await WorkspaceAgentInvocation.updateKnowledgeMetrics(
          this.invocationUuid,
          {
            knowledgeCoverage: knowledgeContext.coverage,
            graphNodesUsed: knowledgeContext.metadata?.graphNodes || 0,
            vectorSourcesUsed: knowledgeContext.metadata?.vectorSources || 0,
            planningDurationMs:
              knowledgeContext.metadata?.processingTimeMs || 0,
          }
        );
        this.log("[Orchestrator] 知识指标已更新到 Invocation");
      }
    } catch (error) {
      // 记录失败不影响 Planning 执行
      this.log(`[Orchestrator] 记录 Planning 决策失败: ${error.message}`);
    }
  }

  /**
   * Phase F: 发送 Planning 决策到前端（Planning 可视化）
   * @private
   * @param {Object} plan - Planning 结果
   * @param {Object} knowledgeContext - 知识上下文
   */
  _sendPlanningDecision(plan, knowledgeContext) {
    if (!this.socket) {
      this.log("[Orchestrator] 无法发送 Planning 决策: socket 未初始化");
      return;
    }

    try {
      const planningData = {
        sessionId: this.invocationUuid || null,
        strategy: plan.strategy,
        reason: plan.reason,
        coverage: knowledgeContext?.coverage || "none",
        graphNodes: knowledgeContext?.metadata?.graphNodes || 0,
        vectorSources: knowledgeContext?.metadata?.vectorSources || 0,
        steps: plan.steps || [],
        knowledgeUtilization: plan.knowledge_utilization || "none",
        timestamp: Date.now(),
      };

      this.socket.send(
        JSON.stringify({
          type: "planningDecision",
          content: planningData,
        })
      );

      this.log("[Orchestrator] Planning 决策已发送到前端");
    } catch (error) {
      this.log(`[Orchestrator] 发送 Planning 决策失败: ${error.message}`);
    }
  }

  /**
   * 降级方案（当 LLM 不可用时）
   */
  fallbackPlan(task, availableFlows, _availableTools) {
    const analysis = this.analyzeTaskComplexity(task);

    // 简单任务直接回答
    if (analysis.complexity === TASK_COMPLEXITY.SIMPLE) {
      return {
        success: true,
        plan: {
          strategy: ORCHESTRATION_STRATEGY.SINGLE,
          reason: "任务简单，无需调用 Flow",
          steps: [{ type: "direct", purpose: "直接回答用户问题" }],
        },
      };
    }

    // 有可用 Flow 则推荐第一个匹配的
    if (availableFlows.length > 0) {
      return {
        success: true,
        plan: {
          strategy: ORCHESTRATION_STRATEGY.SINGLE,
          reason: "使用可用的 Agent Flow",
          steps: [
            {
              type: "flow",
              identifier: availableFlows[0].identifier,
              purpose: availableFlows[0].description,
            },
          ],
        },
      };
    }

    // 默认直接处理
    return {
      success: true,
      plan: {
        strategy: ORCHESTRATION_STRATEGY.SINGLE,
        reason: "无可用 Flow，直接处理",
        steps: [{ type: "direct", purpose: "使用可用工具处理任务" }],
      },
    };
  }

  /**
   * 执行编排方案
   * @param {Object} plan - 执行方案
   * @param {string} originalTask - 原始任务
   * @returns {Promise<Object>} 执行结果
   */
  async executePlan(plan, originalTask) {
    const results = [];
    this.blackboard.set("original_task", originalTask, {
      role: "orchestrator",
    });

    this.introspect(`[编排器] 执行策略: ${plan.strategy}`);
    this.introspect(`[编排器] 原因: ${plan.reason}`);

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      this.introspect(
        `[编排器] 步骤 ${i + 1}/${plan.steps.length}: ${step.purpose}`
      );

      try {
        let result;
        switch (step.type) {
          case "flow":
            result = await this.executeFlowStep(step);
            break;
          case "tool":
            result = await this.executeToolStep(step);
            break;
          case "direct":
          default:
            result = { type: "direct", message: "由 Agent 直接处理" };
            break;
        }

        results.push({ step, result, success: true });

        // 将结果存入 Blackboard
        this.blackboard.set(`step_${i + 1}_result`, result, {
          role: step.type,
          stepIndex: i + 1,
        });
      } catch (error) {
        this.log(`[Orchestrator] Step ${i + 1} failed: ${error.message}`);
        results.push({ step, error: error.message, success: false });
        break; // 步骤失败则中断
      }
    }

    return {
      success: results.every((r) => r.success),
      results,
      blackboard: this.blackboard.getAll(),
    };
  }

  /**
   * 执行 Flow 步骤
   * @param {Object} step - 步骤配置
   * @returns {Promise<Object>} 执行结果
   */
  async executeFlowStep(step) {
    const uuid = step.identifier.replace("@@flow_", "");
    const flow = AgentFlows.loadFlow(uuid);

    if (!flow) {
      throw new Error(`Flow not found: ${step.identifier}`);
    }

    // 准备 Flow 输入（从 Blackboard 获取上下文）
    const context = this.blackboard.getAll();

    this.introspect(`[编排器] 调用 Flow: ${flow.name}`);

    // 返回 Flow 标识符，让 AIbitat 处理实际执行
    return {
      type: "flow",
      flowId: uuid,
      flowName: flow.name,
      identifier: step.identifier,
      context,
    };
  }

  /**
   * 执行工具步骤
   * @param {Object} step - 步骤配置
   * @returns {Promise<Object>} 执行结果
   */
  async executeToolStep(step) {
    // 工具执行由 AIbitat 的 function 机制处理
    return {
      type: "tool",
      toolName: step.identifier,
      message: `工具 ${step.identifier} 将由 Agent 执行`,
    };
  }

  /**
   * 获取 Blackboard 实例
   * @returns {Blackboard}
   */
  getBlackboard() {
    return this.blackboard;
  }

  /**
   * 设置共享 Blackboard（用于跨 Orchestrator 共享）
   * @param {Blackboard} blackboard
   */
  setBlackboard(blackboard) {
    this.blackboard = blackboard;
  }

  /**
   * 初始化 Blackboard 并预填充知识上下文（Phase 2 功能）
   *
   * @description
   * 在 Agent 执行前预填充知识上下文到 Blackboard，使得：
   * 1. 所有后续步骤可以访问知识库上下文
   * 2. 避免每个步骤重复执行知识检索
   * 3. 提供知识覆盖度信息供决策参考
   *
   * @param {string} task - 用户任务
   * @param {Object} workspace - Workspace 对象
   * @param {string} modelName - LLM 模型名称（可选）
   * @returns {Promise<Blackboard>} 初始化后的 Blackboard
   */
  async initializeBlackboard(task, workspace, modelName = "gpt-3.5-turbo") {
    // 重置 Blackboard
    this.blackboard = new Blackboard();

    // 存储原始任务
    this.blackboard.set("original_task", task, {
      role: "user",
      timestamp: new Date().toISOString(),
    });

    // 如果没有 workspace 或知识感知被禁用，直接返回
    if (!workspace) {
      this.log("[Orchestrator] 无 workspace，跳过知识预填充");
      return this.blackboard;
    }

    if (!isKnowledgeSensingEnabled()) {
      this.log(
        "[Orchestrator] 知识感知已禁用 (ENABLE_KNOWLEDGE_SENSING=false)，跳过预填充"
      );
      return this.blackboard;
    }

    try {
      this.log("[Orchestrator] 预填充知识上下文到 Blackboard...");

      const knowledgeContext = await KnowledgeSensing.getKnowledgeContext({
        task,
        workspace,
        maxTokens: 3000,
      });

      // 存储完整知识上下文
      this.blackboard.set("knowledge_context", knowledgeContext, {
        role: "knowledge_sensing",
        coverage: knowledgeContext.coverage,
        sources: knowledgeContext.metadata,
      });

      // 存储知识摘要（快速访问）
      this.blackboard.set("knowledge_summary", knowledgeContext.summary, {
        role: "knowledge_sensing",
      });

      // 存储覆盖度信息
      this.blackboard.set("knowledge_coverage", knowledgeContext.coverage, {
        role: "knowledge_sensing",
        graphNodes: knowledgeContext.metadata?.graphNodes || 0,
        vectorSources: knowledgeContext.metadata?.vectorSources || 0,
      });

      this.log(
        `[Orchestrator] 知识上下文已填充 (覆盖度: ${knowledgeContext.coverage}, ` +
          `图谱节点: ${knowledgeContext.metadata?.graphNodes || 0}, ` +
          `文档来源: ${knowledgeContext.metadata?.vectorSources || 0})`
      );
    } catch (error) {
      this.log(`[Orchestrator] 知识预填充失败: ${error.message}`);
      // 失败不阻塞，设置空的知识上下文
      this.blackboard.set("knowledge_context", null, {
        role: "knowledge_sensing",
        error: error.message,
      });
      this.blackboard.set("knowledge_coverage", COVERAGE_LEVEL.LOW, {
        role: "knowledge_sensing",
        error: error.message,
      });
    }

    return this.blackboard;
  }

  /**
   * 从 Blackboard 获取知识上下文
   * @returns {Object|null} 知识上下文对象
   */
  getKnowledgeContext() {
    return this.blackboard.get("knowledge_context", null);
  }

  /**
   * 从 Blackboard 获取知识覆盖度
   * @returns {string} 覆盖度级别 (low/medium/high)
   */
  getKnowledgeCoverage() {
    return this.blackboard.get("knowledge_coverage", COVERAGE_LEVEL.LOW);
  }

  // ========================================
  // Phase A: Blackboard 异步持久化
  // ========================================

  /**
   * 异步持久化标记（防止重复持久化）
   * @type {boolean}
   */
  pendingPersist = false;

  /**
   * 异步持久化 Blackboard（不阻塞主流程）
   * @description 使用 setImmediate 将持久化操作放入下一个事件循环
   * @returns {void}
   */
  persistBlackboardAsync() {
    if (!this.invocationId || this.pendingPersist) {
      return;
    }

    // 如果 blackboard 为空，跳过持久化
    if (this.blackboard.isEmpty()) {
      return;
    }

    this.pendingPersist = true;

    // 异步执行，不阻塞 Agent 响应
    setImmediate(async () => {
      try {
        const snapshot = {
          timestamp: new Date().toISOString(),
          data: this.blackboard.serialize(),
          metadata: {
            knowledgeCoverage: this.getKnowledgeCoverage(),
            stepCount: this.blackboard.size(),
            keys: this.blackboard.keys(),
          },
        };

        await WorkspaceAgentInvocation.updateBlackboardSnapshot(
          this.invocationId,
          snapshot
        );

        this.log(
          `[Orchestrator] Blackboard persisted async (${this.blackboard.size()} keys)`
        );
      } catch (error) {
        this.log(
          `[Orchestrator] Failed to persist Blackboard: ${error.message}`
        );
      } finally {
        this.pendingPersist = false;
      }
    });
  }

  /**
   * 从数据库恢复 Blackboard
   * @returns {Promise<boolean>} 是否成功恢复
   */
  async restoreBlackboard() {
    if (!this.invocationId) {
      return false;
    }

    try {
      const snapshot = await WorkspaceAgentInvocation.getBlackboardSnapshot(
        this.invocationId
      );

      if (snapshot?.data) {
        this.blackboard.deserialize(snapshot.data);
        this.log(
          `[Orchestrator] Blackboard restored from checkpoint ` +
            `(${snapshot.metadata?.stepCount || 0} keys)`
        );
        return true;
      }
    } catch (error) {
      this.log(`[Orchestrator] Failed to restore Blackboard: ${error.message}`);
    }

    return false;
  }

  /**
   * 获取 Blackboard 摘要（用于调试）
   * @returns {Object}
   */
  getBlackboardSummary() {
    return this.blackboard.getSummary();
  }

  // ========================================
  // Phase L: Agent 调试面板
  // ========================================

  /**
   * 获取调试追踪器实例
   * @returns {DebugTracer}
   */
  getDebugTracer() {
    return this.debugTracer;
  }

  /**
   * 获取调试摘要（用于前端展示）
   * @returns {Object}
   */
  getDebugSummary() {
    return this.debugTracer.getSummary();
  }

  /**
   * 获取调试指标
   * @returns {Object}
   */
  getDebugMetrics() {
    return this.debugTracer.getMetrics();
  }

  /**
   * 获取所有调试事件
   * @returns {Array}
   */
  getDebugEvents() {
    return this.debugTracer.getEvents();
  }
}

/**
 * 检查 Orchestrator 是否启用
 * @description
 * Orchestrator 依赖 KnowledgeSensing，所以使用相同的 Feature Flag
 * 可以通过环境变量 ENABLE_ORCHESTRATOR 单独控制（默认跟随 KNOWLEDGE_SENSING）
 * @returns {boolean}
 */
function isOrchestratorEnabled() {
  // 如果明确设置了 ENABLE_ORCHESTRATOR，使用该值
  if (process.env.ENABLE_ORCHESTRATOR !== undefined) {
    return process.env.ENABLE_ORCHESTRATOR !== "false";
  }
  // 否则跟随 KnowledgeSensing 的状态
  return isKnowledgeSensingEnabled();
}

module.exports = {
  AgentOrchestrator,
  ORCHESTRATION_STRATEGY,
  TASK_COMPLEXITY,
  isOrchestratorEnabled,
};
