const { EmployeeRunEventSink, ARTIFACT_EVENT_TYPES, CONTROL_EVENT_TYPES } = require("../../../../utils/agents/employeeRun/employeeRunEventSink");

describe("EmployeeRunEventSink", () => {
  describe("basic event classification", () => {
    test("statusResponse × 2 + session message → thoughts captured, finalText set", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "statusResponse", content: "thinking..." }));
      sink.send(JSON.stringify({ type: "statusResponse", content: "still thinking..." }));
      sink.send(JSON.stringify({ from: "@agent", to: "USER", content: "final answer" }));

      expect(sink.thoughts).toHaveLength(2);
      expect(sink.thoughts[0]).toBe("thinking...");
      expect(sink.thoughts[1]).toBe("still thinking...");
      expect(sink.finalText).toBe("final answer");
      expect(sink.result().text).toBe("final answer");
    });

    test("toolExecution → enters toolExecutions, does NOT pollute text", () => {
      const sink = new EmployeeRunEventSink();
      const toolExecContent = { executionId: "ex1", toolName: "search", stage: "start", args: {} };
      sink.send(JSON.stringify({ type: "toolExecution", content: toolExecContent }));

      expect(sink.toolExecutions).toHaveLength(1);
      expect(sink.toolExecutions[0]).toEqual(toolExecContent);
      expect(sink.finalText).toBeNull();
    });

    test("fileDownload artifact → enters artifacts, does NOT overwrite text", () => {
      const sink = new EmployeeRunEventSink();
      const artifactContent = { filename: "a.csv", b64Content: "base64data..." };
      sink.send(JSON.stringify({ type: "fileDownload", content: artifactContent }));

      expect(sink.artifacts).toHaveLength(1);
      expect(sink.artifacts[0]).toEqual({ type: "fileDownload", content: artifactContent });
      expect(sink.finalText).toBeNull();
    });

    test("rechartVisualize artifact → classified correctly", () => {
      const sink = new EmployeeRunEventSink();
      const chartContent = { data: [1, 2, 3] };
      sink.send(JSON.stringify({ type: "rechartVisualize", content: chartContent }));

      expect(sink.artifacts).toHaveLength(1);
      expect(sink.artifacts[0].type).toBe("rechartVisualize");
      expect(sink.artifacts[0].content).toEqual(chartContent);
    });
  });

  describe("sources deduplication", () => {
    test("session messages with sources → merge with dedup by id", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({
        from: "@agent",
        to: "USER",
        content: "answer 1",
        sources: [
          { id: "src1", title: "Doc 1", text: "content 1", type: "vector" },
          { id: "src2", title: "Doc 2", text: "content 2", type: "graph" },
        ],
      }));
      sink.send(JSON.stringify({
        from: "@agent",
        to: "USER",
        content: "answer 2",
        sources: [
          { id: "src2", title: "Doc 2", text: "content 2", type: "graph" },  // duplicate
          { id: "src3", title: "Doc 3", text: "content 3", type: "vector" },
        ],
      }));

      expect(sink.sources).toHaveLength(3);
      expect(sink.sources.map((s) => s.id)).toEqual(["src1", "src2", "src3"]);
      expect(sink.finalText).toBe("answer 2");  // last one wins
    });

    test("sources without id field → skipped", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({
        from: "@agent",
        to: "USER",
        content: "reply",
        sources: [
          { id: "src1", title: "Doc 1" },
          { title: "Doc 2" },  // no id
          { id: null, title: "Doc 3" },  // null id
        ],
      }));

      expect(sink.sources).toHaveLength(1);
      expect(sink.sources[0].id).toBe("src1");
    });
  });

  describe("error handling", () => {
    test("wssFailure → sets error with code and message", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "wssFailure", content: "Agent execution failed" }));

      expect(sink.error).not.toBeNull();
      expect(sink.error.code).toBe("agent_error");
      expect(sink.error.message).toBe("Agent execution failed");
    });

    test("USER message → NOT set as finalText", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ from: "USER", to: "@agent", content: "user question" }));

      expect(sink.finalText).toBeNull();
    });

    test("message with null/undefined content → skipped", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ from: "@agent", to: "USER", content: null }));
      sink.send(JSON.stringify({ from: "@agent", to: "USER", content: undefined }));

      expect(sink.finalText).toBeNull();
    });
  });

  describe("invalid JSON handling", () => {
    test("invalid JSON string → silently ignored, not in events", () => {
      const sink = new EmployeeRunEventSink();
      sink.send("not valid JSON {");
      sink.send("{invalid}");

      expect(sink.events).toHaveLength(0);
    });

    test("non-string input → pass-through for compatibility", () => {
      const sink = new EmployeeRunEventSink();
      const obj = { type: "statusResponse", content: "msg" };
      sink.send(obj);  // already an object

      expect(sink.events).toHaveLength(1);
      expect(sink.thoughts).toContain("msg");
    });
  });

  describe("WAITING_ON_INPUT handling", () => {
    test("WAITING_ON_INPUT → enters approvalRequests and emits approvalRequested", (done) => {
      const sink = new EmployeeRunEventSink();
      const approvalData = { type: "WAITING_ON_INPUT", question: "Approve this action?" };

      sink.once("approvalRequested", (data) => {
        expect(data).toEqual(approvalData);
        expect(sink.approvalRequests).toHaveLength(1);
        expect(sink.approvalRequests[0]).toEqual(approvalData);
        done();
      });

      sink.send(JSON.stringify(approvalData));
    });
  });

  describe("onEvent callback", () => {
    test("onEvent called for each send, exactly once per send", () => {
      const callback = jest.fn();
      const sink = new EmployeeRunEventSink({ onEvent: callback });

      sink.send(JSON.stringify({ type: "statusResponse", content: "msg1" }));
      sink.send(JSON.stringify({ type: "statusResponse", content: "msg2" }));
      sink.send(JSON.stringify({ from: "@agent", to: "USER", content: "msg3" }));

      expect(callback).toHaveBeenCalledTimes(3);
    });

    test("onEvent callback receives parsed data", () => {
      const callback = jest.fn();
      const sink = new EmployeeRunEventSink({ onEvent: callback });
      const data = { type: "statusResponse", content: "test" };

      sink.send(JSON.stringify(data));

      expect(callback).toHaveBeenCalledWith(data);
    });

    test("onEvent callback exceptions do NOT interrupt capture", () => {
      const callback = jest.fn(() => {
        throw new Error("Callback error");
      });
      const sink = new EmployeeRunEventSink({ onEvent: callback });

      expect(() => {
        sink.send(JSON.stringify({ type: "statusResponse", content: "msg1" }));
        sink.send(JSON.stringify({ type: "statusResponse", content: "msg2" }));
      }).not.toThrow();

      expect(sink.thoughts).toHaveLength(2);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    test("onEvent not provided → sink still captures events", () => {
      const sink = new EmployeeRunEventSink();  // no callback
      sink.send(JSON.stringify({ type: "statusResponse", content: "msg" }));

      expect(sink.thoughts).toContain("msg");
      expect(sink.events).toHaveLength(1);
    });
  });

  describe("readyState", () => {
    test("readyState === 1 to mimic open websocket", () => {
      const sink = new EmployeeRunEventSink();
      expect(sink.readyState).toBe(1);
    });
  });

  describe("chunk event emission", () => {
    test("each send triggers chunk event", (done) => {
      const sink = new EmployeeRunEventSink();
      const data = { type: "statusResponse", content: "test" };
      let emitted = false;

      sink.on("chunk", (received) => {
        expect(received).toEqual(data);
        emitted = true;
      });

      sink.send(JSON.stringify(data));
      setTimeout(() => {
        expect(emitted).toBe(true);
        done();
      }, 10);
    });
  });

  describe("close and waitForClose", () => {
    test("close() triggers closed event", (done) => {
      const sink = new EmployeeRunEventSink();
      sink.once("closed", () => {
        done();
      });

      sink.close();
    });

    test("waitForClose() resolves with result() after close()", async () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "statusResponse", content: "thinking" }));
      sink.send(JSON.stringify({ from: "@agent", to: "USER", content: "final answer", sources: [{ id: "s1", title: "T1" }] }));
      sink.send(JSON.stringify({ type: "fileDownload", content: { filename: "out.csv" } }));

      const closePromise = sink.waitForClose();
      setTimeout(() => sink.close(), 10);
      const result = await closePromise;

      expect(result.text).toBe("final answer");
      expect(result.sources).toHaveLength(1);
      expect(result.artifacts).toHaveLength(1);
      expect(result.thoughts).toHaveLength(1);
      expect(result.toolExecutions).toHaveLength(0);
      expect(result.error).toBeNull();
    });

    test("result() returns all buckets", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "statusResponse", content: "t1" }));
      sink.send(JSON.stringify({ type: "toolExecution", content: { id: "tool1" } }));
      sink.send(JSON.stringify({ type: "fileDownload", content: { f: "out.csv" } }));
      sink.send(JSON.stringify({ from: "@agent", to: "USER", content: "reply", sources: [{ id: "s1" }] }));

      const result = sink.result();
      expect(result).toHaveProperty("text", "reply");
      expect(result).toHaveProperty("sources");
      expect(result).toHaveProperty("artifacts");
      expect(result).toHaveProperty("toolExecutions");
      expect(result).toHaveProperty("thoughts");
      expect(result).toHaveProperty("events");
      expect(result).toHaveProperty("error");
    });
  });

  describe("control event types", () => {
    test("known control types → entered events[] but not special buckets", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "planningDecision", data: "plan1" }));
      sink.send(JSON.stringify({ type: "flowProgress", progress: 50 }));
      sink.send(JSON.stringify({ type: "agentTaskList", tasks: [] }));
      sink.send(JSON.stringify({ type: "reportStreamEvent", report: "data" }));
      sink.send(JSON.stringify({ type: "conversationSummary", summary: "text" }));

      expect(sink.events).toHaveLength(5);
      expect(sink.thoughts).toHaveLength(0);
      expect(sink.toolExecutions).toHaveLength(0);
      expect(sink.artifacts).toHaveLength(0);
    });
  });

  describe("artifact event types", () => {
    test("ARTIFACT_EVENT_TYPES constant includes expected types", () => {
      expect(ARTIFACT_EVENT_TYPES).toContain("fileDownload");
      expect(ARTIFACT_EVENT_TYPES).toContain("rechartVisualize");
      expect(ARTIFACT_EVENT_TYPES).toContain("pptGenerated");
      expect(ARTIFACT_EVENT_TYPES).toContain("pptContent");
      expect(ARTIFACT_EVENT_TYPES).toContain("pptOutline");
    });

    test("pptGenerated and pptContent and pptOutline → all enter artifacts", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({ type: "pptGenerated", content: { slides: 1 } }));
      sink.send(JSON.stringify({ type: "pptContent", content: { slide: "content" } }));
      sink.send(JSON.stringify({ type: "pptOutline", content: { outline: "structure" } }));

      expect(sink.artifacts).toHaveLength(3);
      expect(sink.artifacts[0].type).toBe("pptGenerated");
      expect(sink.artifacts[1].type).toBe("pptContent");
      expect(sink.artifacts[2].type).toBe("pptOutline");
    });
  });

  describe("CONTROL_EVENT_TYPES constant", () => {
    test("CONTROL_EVENT_TYPES includes all known control types", () => {
      expect(CONTROL_EVENT_TYPES).toContain("statusResponse");
      expect(CONTROL_EVENT_TYPES).toContain("wssFailure");
      expect(CONTROL_EVENT_TYPES).toContain("toolExecution");
      expect(CONTROL_EVENT_TYPES).toContain("WAITING_ON_INPUT");
      expect(CONTROL_EVENT_TYPES).toContain("fileDownload");
      expect(CONTROL_EVENT_TYPES).toContain("planningDecision");
      expect(CONTROL_EVENT_TYPES).toContain("flowProgress");
      expect(CONTROL_EVENT_TYPES).toContain("agentTaskList");
      expect(CONTROL_EVENT_TYPES).toContain("reportStreamEvent");
      expect(CONTROL_EVENT_TYPES).toContain("conversationSummary");
    });

    test("CONTROL_EVENT_TYPES includes approvalSuspended", () => {
      expect(CONTROL_EVENT_TYPES).toContain("approvalSuspended");
    });
  });

  describe("approvalSuspended classification", () => {
    test("approvalSuspended event → pendingApproval set, approvalRequested emitted, text not affected", (done) => {
      const sink = new EmployeeRunEventSink();
      const suspendedData = {
        type: "approvalSuspended",
        content: { confirmationId: "c1", toolName: "myTool", riskLevel: "high" },
      };

      sink.once("approvalRequested", (data) => {
        expect(data).toEqual(suspendedData);
        expect(sink.pendingApproval).toEqual({ confirmationId: "c1", toolName: "myTool", riskLevel: "high" });
        expect(sink.result().pendingApproval).toEqual({ confirmationId: "c1", toolName: "myTool", riskLevel: "high" });
        expect(sink.result().pendingApproval.confirmationId).toBe("c1");
        expect(sink.finalText).toBeNull();
        expect(sink.result().text).toBeNull();
        done();
      });

      sink.send(JSON.stringify(suspendedData));
    });

    test("approvalSuspended does NOT set finalText even when content has string-like fields", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({
        type: "approvalSuspended",
        content: { confirmationId: "c2", toolName: "tool2" },
      }));
      // Also send a real message after to confirm text still works normally
      sink.send(JSON.stringify({ from: "@agent", to: "USER", content: "final reply" }));

      expect(sink.result().text).toBe("final reply");
      expect(sink.result().pendingApproval.confirmationId).toBe("c2");
    });

    test("pendingApproval starts null; result() includes pendingApproval field", () => {
      const sink = new EmployeeRunEventSink();
      expect(sink.pendingApproval).toBeNull();
      expect(sink.result()).toHaveProperty("pendingApproval", null);
    });

    test("approvalSuspended enters events[] (no-loss)", () => {
      const sink = new EmployeeRunEventSink();
      sink.send(JSON.stringify({
        type: "approvalSuspended",
        content: { confirmationId: "c3", toolName: "t3" },
      }));
      expect(sink.events).toHaveLength(1);
      expect(sink.events[0].type).toBe("approvalSuspended");
    });
  });

  describe("integration: B1 anchor", () => {
    test("sink never references real workspace socket; result().events contains all seen", () => {
      const sink = new EmployeeRunEventSink();

      // Verify sink has no socket reference
      expect(sink.hasOwnProperty("socket")).toBe(false);
      expect(sink.hasOwnProperty("_socket")).toBe(false);

      // Send multiple events
      const ev1 = { type: "statusResponse", content: "t1" };
      const ev2 = { from: "@agent", to: "USER", content: "reply" };
      const ev3 = { type: "toolExecution", content: { id: "t1" } };

      sink.send(JSON.stringify(ev1));
      sink.send(JSON.stringify(ev2));
      sink.send(JSON.stringify(ev3));

      // result().events should be all that sink saw
      expect(sink.result().events).toEqual([ev1, ev2, ev3]);
      expect(sink.result().events).toHaveLength(3);
    });
  });
});
