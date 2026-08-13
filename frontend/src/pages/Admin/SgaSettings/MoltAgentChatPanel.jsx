import { useState } from "react";
import Molt from "@/models/molt";
import { t as translate } from "i18next";

function normalizeChatError(resultOrError) {
  if (!resultOrError) return "Molt unavailable";
  if (typeof resultOrError === "string") return resultOrError;
  if (resultOrError instanceof Error) return resultOrError.message;
  if (typeof resultOrError.error === "string") return resultOrError.error;
  if (resultOrError.error?.message) return resultOrError.error.message;
  if (resultOrError.message) return resultOrError.message;
  if (resultOrError.code === "agent_not_found") return "Agent not found";
  return "Molt unavailable";
}

function answerFrom(result) {
  return (
    result?.answer ||
    result?.reply ||
    result?.response ||
    result?.message ||
    result?.data?.answer ||
    ""
  );
}

export async function sendConsoleMessage({
  agentId,
  message,
  chatConsoleAgent = Molt.chatConsoleAgent,
}) {
  const trimmed = String(message || "").trim();
  if (!trimmed) return { clearInput: false, error: null, messages: [] };

  try {
    const result = await chatConsoleAgent(agentId, trimmed);
    if (result?.success === false) {
      return {
        clearInput: false,
        error: normalizeChatError(result),
        messages: [],
      };
    }

    return {
      clearInput: true,
      error: null,
      messages: [
        { role: "user", content: trimmed },
        { role: "assistant", content: answerFrom(result) || "-" },
      ],
    };
  } catch (error) {
    return {
      clearInput: false,
      error: normalizeChatError(error),
      messages: [],
    };
  }
}

export default function MoltAgentChatPanel({
  agentId,
  agentName,
  initialMessages = [],
  isSendingForTest = false,
  onClose,
  t = translate,
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [error, setError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const sending = isSending || isSendingForTest;

  async function handleSubmit(event) {
    event?.preventDefault?.();
    if (sending || !draft.trim()) return;

    setIsSending(true);
    setError(null);
    const result = await sendConsoleMessage({ agentId, message: draft });
    if (result.messages.length > 0) {
      setMessages((previous) => [...previous, ...result.messages]);
    }
    if (result.clearInput) setDraft("");
    if (result.error) setError(result.error);
    setIsSending(false);
  }

  return (
    <div className="mt-4 rounded-lg border border-theme-sidebar-border bg-theme-bg-primary p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-theme-text-primary">
            {t("molt.console.chat.title", { agent: agentName || agentId })}
          </p>
          <p className="mt-1 font-mono text-xs text-theme-text-secondary">
            {agentId}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("molt.console.chat.close")}
          onClick={onClose}
          className="rounded-md border border-theme-sidebar-border px-3 py-1.5 text-xs font-medium text-theme-text-primary hover:bg-theme-action-menu-item-hover"
        >
          {t("molt.console.chat.close")}
        </button>
      </div>

      <div className="mt-4 max-h-72 space-y-3 overflow-y-auto rounded-md border border-theme-sidebar-border bg-theme-bg-secondary p-3">
        {messages.length === 0 && (
          <p className="text-sm text-theme-text-secondary">
            {t("molt.console.chat.placeholder")}
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-md p-3 ${
              message.role === "user"
                ? "bg-theme-bg-primary text-theme-text-primary"
                : "bg-[var(--theme-accent-soft)] text-theme-text-primary"
            }`}
          >
            <p className="mb-1 text-xs font-semibold uppercase text-theme-text-secondary">
              {message.role === "user" ? "User" : "Assistant"}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {message.content}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          <p className="font-medium">{t("molt.console.chat.error")}</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}

      <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("molt.console.chat.placeholder")}
          className="min-h-[96px] resize-y rounded-md border border-theme-sidebar-border bg-theme-bg-secondary p-3 text-sm text-theme-text-primary outline-none placeholder:text-theme-text-secondary focus:border-[var(--theme-accent-primary)]"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="rounded-md bg-primary-button px-4 py-2 text-sm font-medium text-[var(--theme-button-primary-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending
              ? t("molt.console.chat.loading")
              : t("molt.console.chat.send")}
          </button>
        </div>
      </form>
    </div>
  );
}
