/**
 * Orchestrator 插件
 *
 * @description
 * 将 AgentOrchestrator 集成为 AIbitat 插件，
 * 提供任务分析和多 Agent 编排能力。
 */

const { AgentOrchestrator, TASK_COMPLEXITY } = require("../../orchestrator");
const { AgentFlows } = require("../../../agentFlows");

const orchestratorPlugin = {
  name: "task-orchestrator",
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
          description: `分析复杂任务并自动选择最佳执行方案。当用户提出需要多步骤或多工具协作的复杂任务时使用此工具。
此工具会：
1. 分析任务复杂度
2. 从可用的 Agent Flow 中选择合适的执行方案
3. 返回推荐的执行步骤

适用场景：调研分析、报告撰写、多步骤任务规划等。`,
          examples: [
            {
              prompt: "帮我调研竞品并生成分析报告",
              call: JSON.stringify({ task: "调研竞品并生成分析报告" }),
            },
            {
              prompt: "首先搜索资料，然后撰写文章，最后进行校对",
              call: JSON.stringify({
                task: "搜索资料、撰写文章、校对",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              task: {
                type: "string",
                description: "需要分析和编排的任务描述",
              },
            },
            required: ["task"],
            additionalProperties: false,
          },
          handler: async function ({ task }) {
            try {
              const orchestrator = new AgentOrchestrator({
                aibitat: this.super,
                introspect: this.super.introspect?.bind(this.super),
                log: this.super.handlerProps?.log || console.log,
              });

              // 分析任务复杂度
              const analysis = orchestrator.analyzeTaskComplexity(task);
              this.super.introspect?.(
                `[编排器] 任务复杂度: ${analysis.complexity}`
              );

              // 如果是简单任务，直接返回建议
              if (analysis.complexity === TASK_COMPLEXITY.SIMPLE) {
                return JSON.stringify({
                  recommendation: "direct",
                  reason: "任务较简单，可以直接处理，无需调用专门的工作流。",
                  suggestedAction: "直接使用可用工具回答用户问题",
                });
              }

              // 获取可用 Flow
              let availableFlows = [];
              try {
                availableFlows = orchestrator.getAvailableFlows();
              } catch (_e) {
                // 如果获取失败，使用空数组
              }

              // 生成执行方案
              const { plan } = await orchestrator.selectExecutionPlan(
                task,
                availableFlows,
                []
              );

              // 构建响应
              const response = {
                recommendation: plan.strategy,
                reason: plan.reason,
                complexity: analysis.complexity,
                steps: plan.steps.map((step, idx) => ({
                  order: idx + 1,
                  type: step.type,
                  action: step.identifier || step.type,
                  purpose: step.purpose,
                })),
              };

              // 如果有 Flow 推荐，添加提示
              if (plan.steps.some((s) => s.type === "flow")) {
                response.hint =
                  "建议调用推荐的 Agent Flow 来完成此任务。您可以直接提问让 Agent 自动执行。";
              }

              return JSON.stringify(response, null, 2);
            } catch (error) {
              return JSON.stringify({
                error: `编排分析失败: ${error.message}`,
                recommendation: "direct",
                reason: "编排器遇到问题，建议直接处理任务",
              });
            }
          },
        });
      },
    };
  },
};

module.exports = orchestratorPlugin;
