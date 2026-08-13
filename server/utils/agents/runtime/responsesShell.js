const { v4: uuidv4 } = require("uuid");

function nowSeconds(now = Date.now) {
  return Math.floor(now() / 1000);
}

function buildResponseObject({
  id,
  status,
  model,
  createdAt,
  completedAt = null,
  outputText = null,
  messageId = null,
  user = null,
}) {
  const msgId = messageId || `msg_${uuidv4().replace(/-/g, "")}`;
  const output =
    outputText == null
      ? []
      : [
          {
            type: "message",
            id: msgId,
            status: status === "completed" ? "completed" : "in_progress",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: String(outputText || ""),
                annotations: [],
              },
            ],
          },
        ];

  return {
    id,
    object: "response",
    created_at: createdAt,
    status,
    completed_at: completedAt,
    error: null,
    incomplete_details: null,
    model,
    output,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: true,
    temperature: 1.0,
    text: { format: { type: "text" } },
    tool_choice: "auto",
    tools: [],
    top_p: 1.0,
    truncation: "disabled",
    usage: null,
    user,
    metadata: {},
  };
}

/**
 * IO shell that adapts SessionEngine output into OpenAI Responses-compatible
 * SSE payloads while preserving the repo's current wire format.
 */
class ResponsesShell {
  /**
   * @param {import("./sessionEngine")} sessionEngine
   * @param {{uuidFactory?: Function, now?: Function}} [options]
   */
  constructor(sessionEngine, options = {}) {
    this.engine = sessionEngine;
    this.uuidFactory =
      typeof options.uuidFactory === "function" ? options.uuidFactory : uuidv4;
    this.now = typeof options.now === "function" ? options.now : Date.now;
  }

  /**
   * @param {string} userMessage
   * @param {{
   * responseId?: string,
   * model?: string,
   * user?: string|null,
   * createdAt?: number,
   * messageId?: string,
   * sequenceStart?: number
   * }} [options]
   * @returns {AsyncGenerator<{event: string, data: Object}, void, void>}
   */
  async *handleRequest(userMessage, options = {}) {
    const responseId =
      options.responseId || `resp_${this.uuidFactory().replace(/-/g, "")}`;
    const model = options.model || "agent";
    const createdAt = options.createdAt || nowSeconds(this.now);
    const user = options.user || null;
    const messageId =
      options.messageId || `msg_${this.uuidFactory().replace(/-/g, "")}`;
    let sequenceNumber = options.sequenceStart || 1;
    let outputText = "";

    yield {
      event: "response.created",
      data: {
        type: "response.created",
        response: buildResponseObject({
          id: responseId,
          status: "in_progress",
          model,
          createdAt,
          completedAt: null,
          outputText: null,
          user,
        }),
        sequence_number: sequenceNumber++,
      },
    };

    yield {
      event: "response.output_item.added",
      data: {
        type: "response.output_item.added",
        output_index: 0,
        item: {
          id: messageId,
          type: "message",
          status: "in_progress",
          role: "assistant",
          content: [],
        },
        sequence_number: sequenceNumber++,
      },
    };

    yield {
      event: "response.content_part.added",
      data: {
        type: "response.content_part.added",
        item_id: messageId,
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
        sequence_number: sequenceNumber++,
      },
    };

    const eventStream =
      typeof this.engine.streamFormattedEvents === "function"
        ? this.engine.streamFormattedEvents(
            userMessage,
            (runtimeEvent) => runtimeEvent
          )
        : this.engine.submitMessage(userMessage);

    for await (const event of eventStream) {
      if (event?.type !== "result") continue;

      outputText = String(event.content || "");
      yield {
        event: "response.output_text.delta",
        data: {
          type: "response.output_text.delta",
          item_id: messageId,
          output_index: 0,
          content_index: 0,
          delta: outputText,
          sequence_number: sequenceNumber++,
        },
      };
    }

    const finalText =
      (typeof this.engine.getResultContent === "function"
        ? this.engine.getResultContent()
        : "") || outputText;

    yield {
      event: "response.output_text.done",
      data: {
        type: "response.output_text.done",
        item_id: messageId,
        output_index: 0,
        content_index: 0,
        text: finalText,
        sequence_number: sequenceNumber++,
      },
    };

    yield {
      event: "response.content_part.done",
      data: {
        type: "response.content_part.done",
        item_id: messageId,
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: finalText, annotations: [] },
        sequence_number: sequenceNumber++,
      },
    };

    yield {
      event: "response.output_item.done",
      data: {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          id: messageId,
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: finalText, annotations: [] }],
        },
        sequence_number: sequenceNumber++,
      },
    };

    yield {
      event: "response.completed",
      data: {
        type: "response.completed",
        response: buildResponseObject({
          id: responseId,
          status: "completed",
          model,
          createdAt,
          completedAt: nowSeconds(this.now),
          outputText: finalText,
          messageId,
          user,
        }),
        sequence_number: sequenceNumber++,
      },
    };
  }
}

module.exports = ResponsesShell;
