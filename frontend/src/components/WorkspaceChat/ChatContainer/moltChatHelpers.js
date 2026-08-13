import React from "react";

export function selectPrimaryMoltMention(mentions = []) {
  const moltMentions = mentions.filter((mention) => mention?.type === "molt");
  return {
    primary: moltMentions[0] || null,
    ignored: moltMentions.slice(1),
    hasIgnored: moltMentions.length > 1,
  };
}

export function selectPrimaryNativeMention(mentions = []) {
  return mentions.find((mention) => mention?.type === "native") || null;
}

export function buildMoltScopeKey(threadSlug = null) {
  return `workspace-thread:${threadSlug || "default"}`;
}

function updateAssistantByUuid(history = [], uuid, updater) {
  return history.map((message) => {
    if (message?.uuid !== uuid) return message;
    return updater(message);
  });
}

export function appendMoltStreamChunk(history = [], uuid, text = "") {
  return updateAssistantByUuid(history, uuid, (message) => ({
    ...message,
    content: `${message.content || ""}${text || ""}`,
    pending: false,
    animate: true,
    error: null,
  }));
}

export function finalizeMoltStreamMessage(history = [], uuid, metadata = {}) {
  return updateAssistantByUuid(history, uuid, (message) => ({
    ...message,
    pending: false,
    animate: false,
    closed: true,
    chatId: metadata.chatId || message.chatId || null,
    response: {
      ...(message.response || {}),
      molt_thread_id: metadata.molt_thread_id || null,
    },
  }));
}

export function applyMoltStreamError(history = [], uuid, error = {}) {
  const message =
    error?.message || error?.error || "Unable to send message to Molt agent.";
  return {
    threadStale: error?.code === "thread_stale",
    history: updateAssistantByUuid(history, uuid, (item) => ({
      ...item,
      content: item.content || "",
      pending: false,
      animate: false,
      closed: true,
      error: message,
      response: {
        ...(item.response || {}),
        errorCode: error?.code,
      },
    })),
  };
}

export function shouldPreserveMoltInput(error = {}) {
  return Boolean(error?.code || error?.message || error?.error);
}

export function MoltBubbleLabel({ agent, t = (key) => key }) {
  if (!agent) return null;
  const name =
    agent.name || agent.displayName || agent.display_name || agent.id;
  return React.createElement(
    "div",
    { className: "mb-2 flex items-center gap-2 text-xs text-blue-200" },
    React.createElement(
      "span",
      {
        className:
          "rounded bg-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-100",
      },
      "Molt"
    ),
    React.createElement(
      "span",
      null,
      t("molt.chat.bubble_label", { agent: name })
    )
  );
}
