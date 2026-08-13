/**
 * FlowExecutor 单元测试
 *
 * 测试 FlowExecutor 核心执行逻辑
 */

const { FlowExecutor, FLOW_TYPES } = require("../../utils/agentFlows/executor");
const Blackboard = require("../../utils/agentFlows/blackboard");

// Mock 依赖
jest.mock("../../models/telemetry", () => ({
  Telemetry: {
    sendTelemetry: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("FlowExecutor", () => {
  let executor;

  beforeEach(() => {
    executor = new FlowExecutor();
    // 静默日志输出
    executor.introspect = jest.fn();
    executor.logger = jest.fn();
  });

  describe("getValueFromPath", () => {
    test("应正确解析简单路径", () => {
      const obj = { name: "test", value: 123 };
      expect(executor.getValueFromPath(obj, "name")).toBe("test");
      expect(executor.getValueFromPath(obj, "value")).toBe(123);
    });

    test("应正确解析嵌套路径", () => {
      const obj = { data: { user: { name: "Alice" } } };
      expect(executor.getValueFromPath(obj, "data.user.name")).toBe("Alice");
    });

    test("应正确解析数组索引", () => {
      const obj = { items: ["a", "b", "c"] };
      expect(executor.getValueFromPath(obj, "items[0]")).toBe("a");
      expect(executor.getValueFromPath(obj, "items[2]")).toBe("c");
    });

    test("应正确解析复杂混合路径", () => {
      const obj = { data: { items: [{ name: "first" }, { name: "second" }] } };
      expect(executor.getValueFromPath(obj, "data.items[1].name")).toBe("second");
    });

    test("对无效路径应返回 undefined", () => {
      const obj = { name: "test" };
      expect(executor.getValueFromPath(obj, "invalid")).toBeUndefined();
      expect(executor.getValueFromPath(obj, "name.invalid")).toBeUndefined();
    });

    test("对空对象/路径应返回空字符串", () => {
      expect(executor.getValueFromPath({}, "any")).toBe("");
      expect(executor.getValueFromPath({ a: 1 }, "")).toBe("");
    });

    test("应正确解析 JSON 字符串输入", () => {
      const jsonStr = '{"name": "test"}';
      expect(executor.getValueFromPath(jsonStr, "name")).toBe("test");
    });
  });

  describe("replaceVariables", () => {
    beforeEach(() => {
      executor.variables = { name: "Alice", age: 25 };
    });

    test("应替换 ${} 格式变量", () => {
      const config = { greeting: "Hello ${name}!" };
      const result = executor.replaceVariables(config);
      expect(result.greeting).toBe("Hello Alice!");
    });

    test("应替换 {{}} 格式变量", () => {
      const config = { greeting: "Hello {{name}}!" };
      const result = executor.replaceVariables(config);
      expect(result.greeting).toBe("Hello Alice!");
    });

    test("应保留未定义变量原样", () => {
      const config = { text: "Value: ${undefined_var}" };
      const result = executor.replaceVariables(config);
      expect(result.text).toBe("Value: ${undefined_var}");
    });

    test("应递归处理嵌套对象", () => {
      const config = {
        outer: { inner: "Name: ${name}" },
      };
      const result = executor.replaceVariables(config);
      expect(result.outer.inner).toBe("Name: Alice");
    });

    test("应处理数组", () => {
      const config = { items: ["${name}", "static", "${age}"] };
      const result = executor.replaceVariables(config);
      expect(result.items).toEqual(["Alice", "static", "25"]);
    });
  });

  describe("executeStep", () => {
    test("START 类型应初始化变量", async () => {
      const step = {
        type: FLOW_TYPES.START.type,
        config: {
          variables: [
            { name: "input", value: "test" },
            { name: "count", value: "0" },
          ],
        },
      };

      executor.blackboard = new Blackboard();
      const result = await executor.executeStep(step);

      expect(executor.variables.input).toBe("test");
      expect(executor.variables.count).toBe("0");
    });

    test("START 类型不应覆盖已有变量", async () => {
      executor.variables = { input: "existing" };
      const step = {
        type: FLOW_TYPES.START.type,
        config: {
          variables: [{ name: "input", value: "new" }],
        },
      };

      executor.blackboard = new Blackboard();
      await executor.executeStep(step);

      expect(executor.variables.input).toBe("existing");
    });

    test("未知类型应抛出错误", async () => {
      const step = { type: "unknown_type", config: {} };
      executor.blackboard = new Blackboard();

      await expect(executor.executeStep(step)).rejects.toThrow("Unknown flow type: unknown_type");
    });

    test("应将结果存入 resultVariable", async () => {
      const step = {
        type: FLOW_TYPES.START.type,
        config: {
          variables: [{ name: "test", value: "value" }],
          resultVariable: "startResult",
        },
      };

      executor.blackboard = new Blackboard();
      await executor.executeStep(step);

      expect(executor.variables.startResult).toBeDefined();
    });

    test("directOutput 标志应正确传递", async () => {
      const step = {
        type: FLOW_TYPES.START.type,
        config: {
          variables: [],
          directOutput: true,
        },
      };

      executor.blackboard = new Blackboard();
      const result = await executor.executeStep(step);

      expect(result.directOutput).toBe(true);
    });
  });

  describe("_getStepLabel", () => {
    test("应返回正确的中文标签", () => {
      expect(executor._getStepLabel(FLOW_TYPES.LLM_INSTRUCTION.type)).toBe("AI 处理中");
      expect(executor._getStepLabel(FLOW_TYPES.API_CALL.type)).toBe("调用外部服务");
      expect(executor._getStepLabel(FLOW_TYPES.WEB_SCRAPING.type)).toBe("抓取网页内容");
      expect(executor._getStepLabel(FLOW_TYPES.SUBFLOW.type)).toBe("执行子流程");
    });

    test("对未知类型应返回原类型名", () => {
      expect(executor._getStepLabel("custom_type")).toBe("custom_type");
    });
  });
});

