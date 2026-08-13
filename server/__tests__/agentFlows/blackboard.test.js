/**
 * Blackboard 单元测试
 *
 * 测试 Blackboard 数据共享机制的核心功能
 */

const Blackboard = require("../../utils/agentFlows/blackboard");

describe("Blackboard", () => {
  let blackboard;

  beforeEach(() => {
    blackboard = new Blackboard();
  });

  describe("基础数据操作", () => {
    test("set 和 get 应正确存取数据", () => {
      blackboard.set("key1", "value1");
      expect(blackboard.get("key1")).toBe("value1");
    });

    test("get 对不存在的 key 应返回默认值", () => {
      expect(blackboard.get("nonexistent")).toBeNull();
      expect(blackboard.get("nonexistent", "default")).toBe("default");
    });

    test("has 应正确检测 key 存在性", () => {
      blackboard.set("existing", "value");
      expect(blackboard.has("existing")).toBe(true);
      expect(blackboard.has("nonexistent")).toBe(false);
    });

    test("has 对 null/undefined 值应返回 false", () => {
      blackboard.set("nullKey", null);
      blackboard.set("undefinedKey", undefined);
      expect(blackboard.has("nullKey")).toBe(false);
      expect(blackboard.has("undefinedKey")).toBe(false);
    });

    test("delete 应正确删除数据", () => {
      blackboard.set("toDelete", "value");
      expect(blackboard.delete("toDelete")).toBe(true);
      expect(blackboard.has("toDelete")).toBe(false);
    });

    test("delete 对不存在的 key 应返回 false", () => {
      expect(blackboard.delete("nonexistent")).toBe(false);
    });

    test("getAll 应返回所有数据的副本", () => {
      blackboard.set("key1", "value1");
      blackboard.set("key2", "value2");
      const all = blackboard.getAll();
      expect(all).toEqual({ key1: "value1", key2: "value2" });
      // 确保是副本，修改不影响原数据
      all.key1 = "modified";
      expect(blackboard.get("key1")).toBe("value1");
    });

    test("clear 应清空所有数据", () => {
      blackboard.set("key1", "value1");
      blackboard.set("key2", "value2");
      blackboard.clear();
      expect(blackboard.isEmpty()).toBe(true);
      expect(blackboard.size()).toBe(0);
    });
  });

  describe("元数据支持", () => {
    test("set 应正确存储元数据", () => {
      blackboard.set("key1", "value1", { role: "researcher", flowId: "flow-123" });
      const metadata = blackboard.getMetadata("key1");
      expect(metadata.role).toBe("researcher");
      expect(metadata.flowId).toBe("flow-123");
      expect(metadata.updatedAt).toBeDefined();
    });

    test("getMetadata 对不存在的 key 应返回 null", () => {
      expect(blackboard.getMetadata("nonexistent")).toBeNull();
    });
  });

  describe("历史记录", () => {
    test("getHistory 应记录所有操作", () => {
      blackboard.set("key1", "value1");
      blackboard.set("key2", "value2");
      blackboard.delete("key1");

      const history = blackboard.getHistory();
      expect(history.length).toBe(3);
      expect(history[0].action).toBe("set");
      expect(history[1].action).toBe("set");
      expect(history[2].action).toBe("delete");
    });

    test("getHistory 应支持 limit 参数", () => {
      blackboard.set("key1", "value1");
      blackboard.set("key2", "value2");
      blackboard.set("key3", "value3");

      const history = blackboard.getHistory(2);
      expect(history.length).toBe(2);
      expect(history[0].key).toBe("key2");
      expect(history[1].key).toBe("key3");
    });

    test("set 应记录 previousValue", () => {
      blackboard.set("key1", "value1");
      blackboard.set("key1", "value2");

      const history = blackboard.getHistory();
      expect(history[1].previousValue).toBe("value1");
    });
  });

  describe("映射功能", () => {
    test("mapInputs 应正确映射数据", () => {
      blackboard.set("user_query", "What is AI?");
      blackboard.set("context", ["doc1", "doc2"]);

      const inputs = blackboard.mapInputs({
        query: "user_query",
        background: "context",
      });

      expect(inputs.query).toBe("What is AI?");
      expect(inputs.background).toEqual(["doc1", "doc2"]);
    });

    test("mapInputs 应跳过不存在的 key", () => {
      blackboard.set("user_query", "What is AI?");

      const inputs = blackboard.mapInputs({
        query: "user_query",
        missing: "nonexistent",
      });

      expect(inputs.query).toBe("What is AI?");
      expect(inputs.missing).toBeUndefined();
    });

    test("mapOutputs 应正确存储输出", () => {
      blackboard.mapOutputs("result", { data: "test" }, { role: "writer" });
      expect(blackboard.get("result")).toEqual({ data: "test" });
      expect(blackboard.getMetadata("result").role).toBe("writer");
    });
  });

  describe("序列化与反序列化", () => {
    test("serialize 应返回可序列化的数据", () => {
      blackboard.set("key1", "value1", { role: "test" });
      const serialized = blackboard.serialize();

      expect(serialized.data).toEqual({ key1: "value1" });
      expect(serialized.metadata.key1.role).toBe("test");
      expect(serialized.serializedAt).toBeDefined();
    });

    test("deserialize 应正确恢复数据", () => {
      const serialized = {
        data: { key1: "value1" },
        metadata: { key1: { role: "test" } },
        recentHistory: [],
      };

      blackboard.deserialize(serialized);
      expect(blackboard.get("key1")).toBe("value1");
      expect(blackboard.getMetadata("key1").role).toBe("test");
    });
  });
});

