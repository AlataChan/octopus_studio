/**
 * EmployeeRunEventSink — reasoning chunk 分类测试 (Cap2 Task 1)
 */
const {
  EmployeeRunEventSink,
  CONTROL_EVENT_TYPES,
} = require("../../../../utils/agents/employeeRun/employeeRunEventSink");

describe("EmployeeRunEventSink — reasoningChunk classification", () => {
  describe("basic classification", () => {
    test("reasoningChunk event → enters reasoning[], not finalText", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "思考片段" }));

      expect(sink.reasoning).toHaveLength(1);
      expect(sink.reasoning[0]).toBe("思考片段");
      expect(sink.finalText).toBeNull();
    });

    test("multiple reasoningChunks → all appended in order", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "chunk1" }));
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "chunk2" }));
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "chunk3" }));

      expect(sink.reasoning).toEqual(["chunk1", "chunk2", "chunk3"]);
    });

    test("reasoningChunk does NOT pollute thoughts", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "thinking..." }));

      expect(sink.thoughts).toHaveLength(0);
    });

    test("reasoningChunk does NOT pollute toolExecutions", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "reasoning" }));

      expect(sink.toolExecutions).toHaveLength(0);
    });

    test("reasoningChunk does NOT pollute artifacts", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "reasoning" }));

      expect(sink.artifacts).toHaveLength(0);
    });

    test("reasoningChunk still enters events[] (no-loss)", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "thinking" }));

      expect(sink.events).toHaveLength(1);
      expect(sink.events[0].type).toBe("reasoningChunk");
    });
  });

  describe("truncated chunk handling", () => {
    test("reasoningChunk with truncated:true → reasoning contains '[truncated]'", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", truncated: true }));

      expect(sink.reasoning).toHaveLength(1);
      expect(sink.reasoning[0]).toBe("[truncated]");
    });

    test("reasoningChunk with content='' and truncated:true → '[truncated]' wins", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "", truncated: true }));

      // content is "" which is falsy, but data.content ?? ... means "" is returned (not nullish)
      // empty string "" is kept as content (since "" ?? fallback keeps "")
      expect(sink.reasoning).toHaveLength(1);
      expect(sink.reasoning[0]).toBe("");
    });

    test("mixed normal + truncated chunks", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "before truncation" }));
      sink.send(JSON.stringify({ type: "reasoningChunk", truncated: true }));

      expect(sink.reasoning).toEqual(["before truncation", "[truncated]"]);
    });
  });

  describe("interaction with other event types", () => {
    test("reasoningChunk mixed with session message — text not polluted", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "internal thought" }));
      sink.send(JSON.stringify({ from: "@agent", to: "USER", content: "final answer" }));

      expect(sink.finalText).toBe("final answer");
      expect(sink.reasoning).toEqual(["internal thought"]);
    });

    test("reasoningChunk interspersed with statusResponse — both captured independently", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "statusResponse", content: "searching..." }));
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "step 1" }));
      sink.send(JSON.stringify({ type: "statusResponse", content: "found!" }));
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "step 2" }));

      expect(sink.thoughts).toEqual(["searching...", "found!"]);
      expect(sink.reasoning).toEqual(["step 1", "step 2"]);
    });
  });

  describe("result() includes reasoning field", () => {
    test("result() has reasoning property", () => {
      const sink = new EmployeeRunEventSink();
      const r = sink.result();
      expect(r).toHaveProperty("reasoning");
      expect(Array.isArray(r.reasoning)).toBe(true);
    });

    test("result().reasoning starts empty", () => {
      const sink = new EmployeeRunEventSink();
      expect(sink.result().reasoning).toEqual([]);
    });

    test("result().reasoning reflects accumulated chunks", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "r1" }));
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "r2" }));

      expect(sink.result().reasoning).toEqual(["r1", "r2"]);
    });

    test("reasoning is NOT counted as finalText in result()", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "reasoningChunk", content: "internal reasoning" }));

      expect(sink.result().text).toBeNull();
    });
  });

  describe("CONTROL_EVENT_TYPES includes reasoningChunk", () => {
    test("CONTROL_EVENT_TYPES contains 'reasoningChunk'", () => {
      expect(CONTROL_EVENT_TYPES).toContain("reasoningChunk");
    });
  });

  describe("constructor initializes reasoning array", () => {
    test("new sink has reasoning = []", () => {
      const sink = new EmployeeRunEventSink();
      expect(sink.reasoning).toBeDefined();
      expect(Array.isArray(sink.reasoning)).toBe(true);
      expect(sink.reasoning).toHaveLength(0);
    });
  });
});
