function outputTextDelta(event, sequenceNumber) {
  return {
    type: "response.output_text.delta",
    item_id: "coding_message",
    output_index: 0,
    content_index: 0,
    delta: String(event.payload?.text || ""),
    sequence_number: sequenceNumber,
  };
}

function toolCallAdded(event, sequenceNumber) {
  return {
    type: "response.output_item.added",
    output_index: 0,
    item: {
      id: event.payload?.id,
      type: "tool_call",
      status: "in_progress",
      name: event.payload?.name,
      arguments: event.payload?.input || {},
    },
    sequence_number: sequenceNumber,
  };
}

function toolCallDone(event, sequenceNumber) {
  return {
    type: "response.output_item.done",
    output_index: 0,
    item: {
      id: event.payload?.id,
      type: "tool_call",
      status: "completed",
      output: event.payload?.output,
    },
    sequence_number: sequenceNumber,
  };
}

function approvalRequired(event, sequenceNumber) {
  return {
    type: "response.output_item.added",
    output_index: 0,
    item: {
      id: event.payload?.approvalId,
      type: "approval_required",
      status: "in_progress",
      approval_id: event.payload?.approvalId,
      tool_name: event.payload?.toolName || event.payload?.name,
    },
    sequence_number: sequenceNumber,
  };
}

function responseCompleted(event, sequenceNumber, responseId) {
  return {
    type: "response.completed",
    response: {
      id: responseId,
      object: "response",
      status: "completed",
      output_text: event.payload?.finalAnswer || event.payload?.text || "",
    },
    sequence_number: sequenceNumber,
  };
}

function toResponsesStream(events = [], { responseId = "resp_coding" } = {}) {
  const out = [];
  let sequenceNumber = 1;
  for (const event of events || []) {
    if (event.type === "coding.model.delta") {
      out.push(outputTextDelta(event, sequenceNumber++));
    } else if (event.type === "coding.tool.requested") {
      out.push(toolCallAdded(event, sequenceNumber++));
    } else if (event.type === "coding.tool.completed") {
      out.push(toolCallDone(event, sequenceNumber++));
    } else if (event.type === "coding.tool.approval_required") {
      out.push(approvalRequired(event, sequenceNumber++));
    } else if (event.type === "coding.run.completed") {
      out.push(responseCompleted(event, sequenceNumber++, responseId));
    }
  }
  return out;
}

module.exports = {
  toResponsesStream,
};
