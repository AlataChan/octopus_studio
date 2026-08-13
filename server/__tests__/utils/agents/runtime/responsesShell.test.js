const ResponsesShell = require("../../../../utils/agents/runtime/responsesShell");

describe("ResponsesShell", () => {
  test("formats SessionEngine output into Responses-compatible SSE payloads", async () => {
    const engine = {
      result: { type: "success", content: "done" },
      submitMessage: jest.fn(async function* () {
        yield { type: "result", content: "done" };
      }),
    };

    const shell = new ResponsesShell(engine, {
      uuidFactory: () => "12345678-1234-1234-1234-123456789abc",
      now: () => 1700000001,
    });

    const events = [];
    for await (const event of shell.handleRequest("hello", {
      responseId: "resp_test",
      model: "agent:assistant_1",
      user: "user_1",
      createdAt: 1700000000,
      messageId: "msg_test",
      sequenceStart: 1,
    })) {
      events.push(event);
    }

    expect(engine.submitMessage).toHaveBeenCalledWith("hello");
    expect(events.map((event) => event.event)).toEqual([
      "response.created",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.completed",
    ]);
    expect(events[0].data).toMatchObject({
      type: "response.created",
      response: {
        id: "resp_test",
        status: "in_progress",
        model: "agent:assistant_1",
      },
      sequence_number: 1,
    });
    expect(events[3].data).toMatchObject({
      type: "response.output_text.delta",
      item_id: "msg_test",
      delta: "done",
      sequence_number: 4,
    });
    expect(events[7].data).toMatchObject({
      type: "response.completed",
      response: {
        id: "resp_test",
        status: "completed",
      },
      sequence_number: 8,
    });
  });
});
