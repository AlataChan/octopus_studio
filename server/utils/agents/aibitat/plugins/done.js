/**
 * Done Tool Plugin
 *
 * Provides an explicit task completion signal for agent loops.
 * This tool is designed to be safe when `requireDoneTool` is not enabled:
 * - It will not terminate the chat by default.
 * - It simply records the completion intent so the agent loop can decide what to do.
 */

const doneTool = {
  name: "done",
  startupConfig: {
    params: {
      enabled: {
        required: false,
        default: true,
      },
    },
  },
  plugin: function ({ enabled = true } = {}) {
    return {
      name: this.name,
      setup(aibitat) {
        if (!enabled) return;

        aibitat.function({
          name: "done",
          description:
            "显式标记任务已完成，并将最终答复传递给用户。当且仅当你确信任务已完成时调用，message 字段的内容会直接作为本次回复展示给用户，请写完整、详尽的最终答复。",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description:
                  "给用户的【完整最终答复】：把面向用户的完整、详尽的回答正文写在这里（这段文本会直接作为本次回复展示给用户），不要只写简短摘要。",
              },
            },
            required: ["message"],
          },
          handler: async function ({ message }) {
            const msg = String(message || "").trim();
            // Mark completion intent so the agent loop can terminate if required.
            if (typeof aibitat?.markTaskComplete === "function") {
              aibitat.markTaskComplete(msg);
            } else {
              // Backwards-compat: store on instance if helper not present
              aibitat._taskComplete = true;
              aibitat._taskCompleteMessage = msg;
            }

            // Stop further tool-chaining for this step. The loop will decide whether to terminate.
            // 修复：直接用 setup 闭包捕获的 aibitat 实例，而非 this.super
            // （this.super 在 handleAsyncExecution 路径下未定义，会抛
            // "Cannot set properties of undefined (setting 'skipHandleExecution')"）
            if (aibitat) aibitat.skipHandleExecution = true;
            return "OK";
          },
        });
      },
    };
  },
};

module.exports = { doneTool };
