import { ABORT_STREAM_EVENT } from "@/utils/chat";
import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { v4 } from "uuid";

const WorkspaceThread = {
  all: async function (workspaceSlug) {
    const { threads } = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/threads`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        return { threads: [] };
      });

    return { threads };
  },
  new: async function (workspaceSlug) {
    const { thread, error } = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/new`,
      {
        method: "POST",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        return { thread: null, error: e.message };
      });

    return { thread, error };
  },
  update: async function (workspaceSlug, threadSlug, data = {}) {
    const { thread, message } = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/update`,
      {
        method: "POST",
        body: JSON.stringify(data),
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        return { thread: null, message: e.message };
      });

    return { thread, message };
  },
  delete: async function (workspaceSlug, threadSlug) {
    return await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}`,
      {
        method: "DELETE",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.ok)
      .catch(() => false);
  },
  deleteBulk: async function (workspaceSlug, threadSlugs = []) {
    return await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread-bulk-delete`,
      {
        method: "DELETE",
        body: JSON.stringify({ slugs: threadSlugs }),
        headers: baseHeaders(),
      }
    )
      .then((res) => res.ok)
      .catch(() => false);
  },
  chatHistory: async function (workspaceSlug, threadSlug, assistantId = undefined) {
    const params = new URLSearchParams();
    if (assistantId !== undefined) {
      params.set("assistantId", assistantId === null ? "null" : String(assistantId));
    }
    const qs = params.toString() ? `?${params.toString()}` : "";
    const history = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/chats${qs}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .then((res) => res.history || [])
      .catch(() => []);
    return history;
  },
  streamChat: async function (
    { workspaceSlug, threadSlug },
    message,
    handleChat,
    attachments = [],
    assistantId = null,
    responseStyle = null,
    authorizationMode = null
  ) {
    const ctrl = new AbortController();
    const STREAM_IDLE_TIMEOUT_MS = 3 * 60 * 1000; // idle watchdog (no events) after stream start
    const STREAM_IDLE_CHECK_INTERVAL_MS = 5 * 1000;
    let lastEventAt = Date.now();
    let idleInterval = null;

    const cleanup = () => {
      if (idleInterval) {
        clearInterval(idleInterval);
        idleInterval = null;
      }
      window.removeEventListener(ABORT_STREAM_EVENT, abortHandler);
    };

    const abortWithUiReset = () => {
      if (ctrl.signal.aborted) return;
      ctrl.abort();
      handleChat({ id: v4(), type: "stopGeneration" });
    };

    const abortWithError = (error) => {
      handleChat({
        id: v4(),
        type: "abort",
        textResponse: null,
        sources: [],
        close: true,
        error,
      });
      if (!ctrl.signal.aborted) ctrl.abort();
    };

    const startIdleWatchdog = () => {
      if (idleInterval) clearInterval(idleInterval);
      idleInterval = setInterval(() => {
        if (ctrl.signal.aborted) return;
        if (!lastEventAt) return;
        const idleFor = Date.now() - lastEventAt;
        if (idleFor >= STREAM_IDLE_TIMEOUT_MS) {
          abortWithError(
            `Streaming connection timed out after ${Math.round(
              idleFor / 1000
            )}s without events.`
          );
        }
      }, STREAM_IDLE_CHECK_INTERVAL_MS);
    };

    // Listen for the ABORT_STREAM_EVENT key to be emitted by the client
    // to early abort the streaming response. On abort we send a special `stopGeneration`
    // event to be handled which resets the UI for us to be able to send another message.
    // The backend response abort handling is done in each LLM's handleStreamResponse.
    const abortHandler = () => abortWithUiReset();
    window.addEventListener(ABORT_STREAM_EVENT, abortHandler, { once: true });

    try {
      await fetchEventSource(
        `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/stream-chat`,
        {
          method: "POST",
          body: JSON.stringify({
            message,
            attachments,
            assistantId,
            responseStyle,
            authorizationMode,
          }),
          headers: baseHeaders(),
          signal: ctrl.signal,
          openWhenHidden: true,
          async onopen(response) {
            lastEventAt = Date.now();
            startIdleWatchdog();

            if (response.ok) {
              return; // everything's good
            } else if (
              response.status >= 400 &&
              response.status < 500 &&
              response.status !== 429
            ) {
              abortWithError(
                `An error occurred while streaming response. Code ${response.status}`
              );
              throw new Error("Invalid Status code response.");
            } else {
              abortWithError(
                `An error occurred while streaming response. Unknown Error.`
              );
              throw new Error("Unknown error");
            }
          },
          async onmessage(msg) {
            lastEventAt = Date.now();
            try {
              const chatResult = JSON.parse(msg.data);
              handleChat(chatResult);
            } catch {}
          },
          onclose() {
            cleanup();
          },
          onerror(err) {
            abortWithError(
              `An error occurred while streaming response. ${err.message}`
            );
            cleanup();
            throw new Error(); // prevent auto-retry
          },
        }
      );
    } finally {
      cleanup();
    }
  },
  _deleteEditedChats: async function (
    workspaceSlug = "",
    threadSlug = "",
    startingId
  ) {
    return await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/delete-edited-chats`,
      {
        method: "DELETE",
        headers: baseHeaders(),
        body: JSON.stringify({ startingId }),
      }
    )
      .then((res) => {
        if (res.ok) return true;
        throw new Error("Failed to delete chats.");
      })
      .catch((e) => {
        console.log(e);
        return false;
      });
  },
  _updateChatResponse: async function (
    workspaceSlug = "",
    threadSlug = "",
    chatId,
    newText
  ) {
    return await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/thread/${threadSlug}/update-chat`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ chatId, newText }),
      }
    )
      .then((res) => {
        if (res.ok) return true;
        throw new Error("Failed to update chat.");
      })
      .catch((e) => {
        console.log(e);
        return false;
      });
  },
};

export default WorkspaceThread;
