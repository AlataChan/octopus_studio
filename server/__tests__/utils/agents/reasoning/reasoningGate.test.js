const {
  isReasoningEnabled,
  createReasoningStreamController,
} = require("../../../../utils/agents/reasoning/reasoningGate");

describe("isReasoningEnabled", () => {
  test("returns false when env var not set", () => {
    expect(isReasoningEnabled({})).toBe(false);
  });

  test("returns false when env var is undefined", () => {
    expect(isReasoningEnabled({ REASONING_STREAMS_ENABLED: undefined })).toBe(false);
  });

  test("returns false when env var is empty string", () => {
    expect(isReasoningEnabled({ REASONING_STREAMS_ENABLED: "" })).toBe(false);
  });

  test("returns false when env var is 'false'", () => {
    expect(isReasoningEnabled({ REASONING_STREAMS_ENABLED: "false" })).toBe(false);
  });

  test("returns false when env var is '1'", () => {
    expect(isReasoningEnabled({ REASONING_STREAMS_ENABLED: "1" })).toBe(false);
  });

  test("returns false when env var is 'yes'", () => {
    expect(isReasoningEnabled({ REASONING_STREAMS_ENABLED: "yes" })).toBe(false);
  });

  test("returns true when env var is 'true'", () => {
    expect(isReasoningEnabled({ REASONING_STREAMS_ENABLED: "true" })).toBe(true);
  });

  test("returns true when env var is 'TRUE' (case insensitive)", () => {
    expect(isReasoningEnabled({ REASONING_STREAMS_ENABLED: "TRUE" })).toBe(true);
  });

  test("returns true when env var is 'True' (mixed case)", () => {
    expect(isReasoningEnabled({ REASONING_STREAMS_ENABLED: "True" })).toBe(true);
  });

  test("uses process.env by default (not set → false)", () => {
    const orig = process.env.REASONING_STREAMS_ENABLED;
    delete process.env.REASONING_STREAMS_ENABLED;
    try {
      expect(isReasoningEnabled()).toBe(false);
    } finally {
      if (orig !== undefined) process.env.REASONING_STREAMS_ENABLED = orig;
    }
  });
});

describe("createReasoningStreamController", () => {
  describe("normal accept flow", () => {
    test("accept returns emit:true and the content string", () => {
      const ctrl = createReasoningStreamController();
      const result = ctrl.accept("hello");
      expect(result.emit).toBe(true);
      expect(result.content).toBe("hello");
      expect(result.truncate).toBe(false);
    });

    test("accept coerces non-string to string", () => {
      const ctrl = createReasoningStreamController();
      const result = ctrl.accept(42);
      expect(result.emit).toBe(true);
      expect(result.content).toBe("42");
    });

    test("accept handles null/undefined content as empty string", () => {
      const ctrl = createReasoningStreamController();
      const r1 = ctrl.accept(null);
      const r2 = ctrl.accept(undefined);
      expect(r1.emit).toBe(true);
      expect(r1.content).toBe("");
      expect(r2.emit).toBe(true);
      expect(r2.content).toBe("");
    });

    test("accumulates chunk count across calls", () => {
      const ctrl = createReasoningStreamController({ maxChunks: 3, maxChars: 10000 });
      ctrl.accept("a");
      ctrl.accept("b");
      const r3 = ctrl.accept("c");
      expect(r3.emit).toBe(true);
      expect(r3.content).toBe("c");
      expect(ctrl.truncated).toBe(false);
    });

    test("truncated getter starts as false", () => {
      const ctrl = createReasoningStreamController();
      expect(ctrl.truncated).toBe(false);
    });
  });

  describe("maxChunks truncation", () => {
    test("exactly at maxChunks boundary → the (maxChunks+1)th call triggers truncate", () => {
      const ctrl = createReasoningStreamController({ maxChunks: 2, maxChars: 99999 });
      ctrl.accept("a"); // chunk 1
      ctrl.accept("b"); // chunk 2 — now chunks === maxChunks
      const truncResult = ctrl.accept("c"); // chunks >= maxChunks → truncate
      expect(truncResult.emit).toBe(true);
      expect(truncResult.truncate).toBe(true);
      expect(truncResult.content).toBe("");
      expect(ctrl.truncated).toBe(true);
    });

    test("after truncation, subsequent calls return emit:false", () => {
      const ctrl = createReasoningStreamController({ maxChunks: 1, maxChars: 99999 });
      ctrl.accept("first"); // chunk 1 → ok
      ctrl.accept("overflow"); // triggers truncate
      const after = ctrl.accept("more");
      expect(after.emit).toBe(false);
      expect(after.content).toBeUndefined();
    });

    test("truncated getter becomes true after truncation", () => {
      const ctrl = createReasoningStreamController({ maxChunks: 1, maxChars: 99999 });
      ctrl.accept("a"); // ok
      ctrl.accept("b"); // truncate
      expect(ctrl.truncated).toBe(true);
    });
  });

  describe("maxChars truncation", () => {
    test("cumulative chars exceeding maxChars triggers truncation", () => {
      const ctrl = createReasoningStreamController({ maxChunks: 9999, maxChars: 10 });
      ctrl.accept("hello"); // 5 chars
      const r = ctrl.accept("world!"); // 5 + 6 = 11 > 10 → truncate
      expect(r.emit).toBe(true);
      expect(r.truncate).toBe(true);
      expect(ctrl.truncated).toBe(true);
    });

    test("exact char boundary: equal to maxChars is still allowed", () => {
      const ctrl = createReasoningStreamController({ maxChunks: 9999, maxChars: 5 });
      const r = ctrl.accept("hello"); // 5 === maxChars, condition: chars + s.length > maxChars → 0 + 5 > 5 is false
      expect(r.emit).toBe(true);
      expect(r.content).toBe("hello");
      expect(ctrl.truncated).toBe(false);
    });

    test("one char over maxChars triggers truncation", () => {
      const ctrl = createReasoningStreamController({ maxChunks: 9999, maxChars: 5 });
      ctrl.accept("hello"); // 5 chars, fine
      const r = ctrl.accept("x"); // 5 + 1 > 5 → truncate
      expect(r.emit).toBe(true);
      expect(r.truncate).toBe(true);
    });

    test("after char truncation, all subsequent calls are emit:false", () => {
      const ctrl = createReasoningStreamController({ maxChunks: 9999, maxChars: 5 });
      ctrl.accept("hello"); // 5 chars
      ctrl.accept("overflow"); // truncate
      const r = ctrl.accept("anything");
      expect(r.emit).toBe(false);
    });
  });

  describe("default parameters", () => {
    test("default maxChunks=400: 400 accepts succeed, 401st triggers truncation", () => {
      const ctrl = createReasoningStreamController();
      for (let i = 0; i < 400; i++) {
        const r = ctrl.accept("x");
        expect(r.emit).toBe(true);
      }
      const overflow = ctrl.accept("x");
      expect(overflow.emit).toBe(true);
      expect(overflow.truncate).toBe(true);
    });

    test("default maxChars=8000: single chunk of 8001 chars triggers truncation", () => {
      const ctrl = createReasoningStreamController();
      const r = ctrl.accept("x".repeat(8001));
      expect(r.emit).toBe(true);
      expect(r.truncate).toBe(true);
    });
  });
});
