const { getOfficeProjection } = require("./singleton");

function getInvocationActorId(invocation) {
  return invocation?.assistant_id ? String(invocation.assistant_id) : null;
}

function createOfficeFinish({
  getProjection = getOfficeProjection,
  actorId,
  sessionId,
}) {
  let finished = false;

  return function officeFinish(success) {
    if (finished) return;
    finished = true;

    const projection = getProjection?.();
    if (!projection || !actorId) return;

    if (!success) {
      projection.handleInvocationError(actorId, sessionId);
    }
    projection.handleInvocationEnd(actorId, sessionId);
  };
}

function bridgeToolCall({
  getProjection = getOfficeProjection,
  invocation,
  sessionId,
  toolName,
  stage,
}) {
  if (stage !== "start") return;

  const projection = getProjection?.();
  const actorId = getInvocationActorId(invocation);
  if (!projection || !actorId) return;

  projection.handleToolCall(actorId, sessionId, toolName);
}

function bridgeSpeaking({
  getProjection = getOfficeProjection,
  invocation,
  sessionId,
  message,
}) {
  if (!message || message.from === "USER") return;

  const projection = getProjection?.();
  const actorId = getInvocationActorId(invocation);
  if (!projection || !actorId) return;

  projection.handleSpeaking(
    actorId,
    sessionId,
    typeof message.content === "string" ? message.content : ""
  );
}

module.exports = {
  bridgeSpeaking,
  bridgeToolCall,
  createOfficeFinish,
  getInvocationActorId,
};
