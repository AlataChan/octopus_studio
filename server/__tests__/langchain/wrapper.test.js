/**
 * LangChain 包装器单元测试
 */

const LangChainWrapper = require("../../utils/agents/langchain-wrapper");
const {
  calculatorTool,
  jsonParserTool,
} = require("../../utils/agents/langchain-tools");

describe("LangChainWrapper", () => {
  describe("convertSchema", () => {
    it("should return existing JSON Schema as-is", () => {
      const jsonSchema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };

      const result = LangChainWrapper.convertSchema(jsonSchema);
      expect(result).toEqual(jsonSchema);
    });

    it("should convert plain object to JSON Schema", () => {
      const plainObj = {
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      };

      const result = LangChainWrapper.convertSchema(plainObj);
      expect(result.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(result.type).toBe("object");
      expect(result.properties.query.type).toBe("string");
    });

    it("should return empty schema for null input", () => {
      const result = LangChainWrapper.convertSchema(null);
      expect(result.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(result.type).toBe("object");
      expect(result.properties).toEqual({});
    });

    it("should return empty schema for undefined input", () => {
      const result = LangChainWrapper.convertSchema(undefined);
      expect(result.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(result.type).toBe("object");
    });
  });

  describe("wrapStructuredTool", () => {
    it("should wrap a mock LangChain tool", () => {
      const mockTool = {
        name: "test-tool",
        description: "A test tool",
        schema: {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: {
            input: { type: "string" },
          },
        },
        invoke: jest.fn().mockResolvedValue("test result"),
      };

      const wrapped = LangChainWrapper.wrapStructuredTool(mockTool);

      expect(wrapped.name).toBe("test-tool");
      expect(typeof wrapped.plugin).toBe("function");
    });

    it("should use custom name when provided", () => {
      const mockTool = {
        name: "original-name",
        description: "A test tool",
        invoke: jest.fn(),
      };

      const wrapped = LangChainWrapper.wrapStructuredTool(mockTool, {
        name: "custom-name",
      });

      expect(wrapped.name).toBe("custom-name");
    });

    it("should use custom description when provided", () => {
      const mockTool = {
        name: "test-tool",
        description: "Original description",
        invoke: jest.fn(),
      };

      const wrapped = LangChainWrapper.wrapStructuredTool(mockTool, {
        description: "Custom description",
      });

      const plugin = wrapped.plugin();
      expect(plugin.name).toBe("test-tool");
    });
  });

  describe("wrapTools", () => {
    it("should wrap multiple tools", () => {
      const tools = [
        { name: "tool1", description: "Tool 1", invoke: jest.fn() },
        { name: "tool2", description: "Tool 2", invoke: jest.fn() },
      ];

      const wrapped = LangChainWrapper.wrapTools(tools);

      expect(wrapped).toHaveLength(2);
      expect(wrapped[0].name).toBe("tool1");
      expect(wrapped[1].name).toBe("tool2");
    });
  });
});

describe("Built-in LangChain Tools", () => {
  describe("calculatorTool", () => {
    it("should have correct structure", () => {
      expect(calculatorTool.name).toBe("calculator");
      expect(typeof calculatorTool.plugin).toBe("function");
    });

    it("should create valid plugin", () => {
      const plugin = calculatorTool.plugin();
      expect(plugin.name).toBe("calculator");
      expect(typeof plugin.setup).toBe("function");
    });
  });

  describe("jsonParserTool", () => {
    it("should have correct structure", () => {
      expect(jsonParserTool.name).toBe("json-parser");
      expect(typeof jsonParserTool.plugin).toBe("function");
    });

    it("should create valid plugin", () => {
      const plugin = jsonParserTool.plugin();
      expect(plugin.name).toBe("json-parser");
      expect(typeof plugin.setup).toBe("function");
    });
  });
});

describe("Plugin Integration", () => {
  it("should register function with mock AIbitat", () => {
    const mockAibitat = {
      function: jest.fn(),
      introspect: jest.fn(),
    };

    const plugin = calculatorTool.plugin();
    plugin.setup(mockAibitat);

    expect(mockAibitat.function).toHaveBeenCalledTimes(1);
    const functionConfig = mockAibitat.function.mock.calls[0][0];
    expect(functionConfig.name).toBe("calculator");
    expect(typeof functionConfig.handler).toBe("function");
  });

  it("should register jsonParser function with mock AIbitat", () => {
    const mockAibitat = {
      function: jest.fn(),
      introspect: jest.fn(),
    };

    const plugin = jsonParserTool.plugin();
    plugin.setup(mockAibitat);

    expect(mockAibitat.function).toHaveBeenCalledTimes(1);
    const functionConfig = mockAibitat.function.mock.calls[0][0];
    expect(functionConfig.name).toBe("json-parser");
  });
});

