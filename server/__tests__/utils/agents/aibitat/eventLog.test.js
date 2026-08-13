const fs = require("fs");
const path = require("path");
const EventLog = require("../../../../utils/agents/aibitat/eventLog");

describe("EventLog", () => {
  test("tracks unpaired tool calls and flushes jsonl records", async () => {
    const sessionId = `event-log-${Date.now()}`;
    const eventLog = new EventLog(sessionId);

    eventLog.append({
      type: "tool_use",
      toolUseId: "tool-1",
      toolName: "web-search",
    });
    eventLog.append({
      type: "tool_use",
      toolUseId: "tool-2",
      toolName: "read-file",
    });
    eventLog.append({
      type: "tool_result",
      toolUseId: "tool-1",
      toolName: "web-search",
      data: { type: "success" },
    });

    expect(eventLog.getUnpairedToolCalls().map((item) => item.toolUseId)).toEqual([
      "tool-2",
    ]);

    await eventLog._flushQueue;

    const logPath = path.resolve(
      process.env.STORAGE_DIR,
      ".alataflow",
      "events",
      `${sessionId}.jsonl`
    );

    expect(fs.existsSync(logPath)).toBe(true);
    const contents = fs.readFileSync(logPath, "utf8");
    expect(contents).toContain('"type":"tool_use"');
    expect(contents).toContain('"toolUseId":"tool-1"');

    fs.rmSync(path.dirname(logPath), { recursive: true, force: true });
  });
});
