"use strict";

const {
  buildGuardrailPipeline,
} = require("../agents/guardrails/buildPipeline");

let _chatPipeline = null;

function chatPipeline() {
  if (!_chatPipeline) {
    _chatPipeline = buildGuardrailPipeline({
      blockInjection: true,
      outputRedact: true,
    });
  }
  return _chatPipeline;
}

function chatGuardrailEnabled(env = process.env) {
  return String(env.GUARDRAILS_CHAT_ENABLED || "").toLowerCase() === "true";
}

async function checkChatInput(
  message,
  { workspaceId, pipeline, env = process.env } = {}
) {
  if (!chatGuardrailEnabled(env) || !message) {
    return { blocked: false, findings: [] };
  }
  const r = await (pipeline || chatPipeline()).runInput(String(message), {
    workspaceId,
  });
  return { blocked: !!r.blocked, findings: r.findings || [] };
}

async function redactForPersist(
  text,
  { workspaceId, pipeline, env = process.env } = {}
) {
  if (!chatGuardrailEnabled(env) || !text) return text;
  const r = await (pipeline || chatPipeline()).runOutput(String(text), {
    workspaceId,
  });
  return r.text ?? text;
}

module.exports = {
  chatGuardrailEnabled,
  checkChatInput,
  redactForPersist,
};
