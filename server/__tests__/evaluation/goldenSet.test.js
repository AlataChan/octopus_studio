/**
 * Golden Set Manager 单元测试
 */

const path = require("path");
const GoldenSetManager = require("../../utils/evaluation/goldenSet");

describe("GoldenSetManager", () => {
  let manager;

  beforeEach(() => {
    manager = new GoldenSetManager("qa");
  });

  describe("load", () => {
    test("应正确加载 JSON 文件", () => {
      const items = manager.load("sample.json");

      expect(items).toBeInstanceOf(Array);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty("id");
      expect(items[0]).toHaveProperty("input");
      expect(items[0]).toHaveProperty("expectedOutput");
    });

    test("加载不存在的文件应抛出错误", () => {
      expect(() => manager.load("nonexistent.json")).toThrow("Golden Set file not found");
    });

    test("应自动补充默认字段", () => {
      const items = manager.load("sample.json");

      items.forEach((item) => {
        expect(item).toHaveProperty("category");
        expect(item).toHaveProperty("tags");
        expect(item).toHaveProperty("difficulty");
        expect(item).toHaveProperty("metadata");
      });
    });
  });

  describe("filterByCategory", () => {
    beforeEach(() => {
      manager.load("sample.json");
    });

    test("应正确按分类筛选", () => {
      const hrItems = manager.filterByCategory("HR政策");

      expect(hrItems.length).toBeGreaterThan(0);
      hrItems.forEach((item) => {
        expect(item.category).toBe("HR政策");
      });
    });

    test("不存在的分类应返回空数组", () => {
      const items = manager.filterByCategory("不存在的分类");
      expect(items).toEqual([]);
    });
  });

  describe("filterByDifficulty", () => {
    beforeEach(() => {
      manager.load("sample.json");
    });

    test("应正确按难度筛选", () => {
      const easyItems = manager.filterByDifficulty("easy");

      expect(easyItems.length).toBeGreaterThan(0);
      easyItems.forEach((item) => {
        expect(item.difficulty).toBe("easy");
      });
    });
  });

  describe("sample", () => {
    beforeEach(() => {
      manager.load("sample.json");
    });

    test("应返回指定数量的样本", () => {
      const samples = manager.sample(3);

      expect(samples.length).toBe(3);
    });

    test("请求数量超过总数时应返回全部", () => {
      const total = manager.items.length;
      const samples = manager.sample(total + 10);

      expect(samples.length).toBe(total);
    });
  });

  describe("getStats", () => {
    beforeEach(() => {
      manager.load("sample.json");
    });

    test("应返回正确的统计信息", () => {
      const stats = manager.getStats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("categories");
      expect(stats).toHaveProperty("difficulties");
      expect(stats.total).toBe(manager.items.length);
    });
  });

  describe("save", () => {
    const tempFile = path.join(__dirname, "temp_test.json");

    afterEach(() => {
      const fs = require("fs");
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });

    test("应正确保存数据集", () => {
      const items = [
        { id: "test-1", input: "测试输入", expectedOutput: "测试输出" },
      ];

      manager.save(tempFile, items);

      const fs = require("fs");
      expect(fs.existsSync(tempFile)).toBe(true);

      const content = JSON.parse(fs.readFileSync(tempFile, "utf-8"));
      expect(content.items.length).toBe(1);
      expect(content.scenario).toBe("qa");
    });
  });

  describe("_validate", () => {
    test("缺少 input 字段应抛出错误", () => {
      expect(() => {
        manager._validate([{ expectedOutput: "output" }]);
      }).toThrow("missing required field: input");
    });

    test("缺少 expectedOutput 字段应抛出错误", () => {
      expect(() => {
        manager._validate([{ input: "input" }]);
      }).toThrow("missing required field: expectedOutput");
    });

    test("非数组输入应抛出错误", () => {
      expect(() => {
        manager._validate({ input: "not an array" });
      }).toThrow("must be an array");
    });
  });
});

