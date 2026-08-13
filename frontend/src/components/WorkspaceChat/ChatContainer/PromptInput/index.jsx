import React, { useState, useRef, useEffect } from "react";
import SlashCommandsButton, {
  SlashCommands,
  useSlashCommands,
} from "./SlashCommands";
import debounce from "lodash.debounce";
import {
  PaperPlaneRight,
  Graph,
  Image as ImageIcon,
} from "@phosphor-icons/react";
import StopGenerationButton from "./StopGenerationButton";
import ResponseStyleButton from "./ResponseStyleButton";
import LLMSelectorAction from "./LLMSelector/action";
import SpeechToText from "./SpeechToText";
import { Tooltip } from "react-tooltip";
import AttachmentManager from "./Attachments";
import AttachItem from "./AttachItem";
import AnalysisDataButton from "./AnalysisDataButton";
import ScheduledTasksButton from "./ScheduledTasksButton";
import {
  ATTACHMENTS_PROCESSED_EVENT,
  ATTACHMENTS_PROCESSING_EVENT,
  PASTE_ATTACHMENT_EVENT,
} from "../DnDWrapper";
import useTextSize from "@/hooks/useTextSize";
import { useTranslation } from "react-i18next";
import Appearance from "@/models/appearance";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import Molt from "@/models/molt";
import { useNavigate } from "react-router-dom";
import paths from "@/utils/paths";
import { useIsAgentSessionActive } from "@/utils/chat/agent";
import { IMAGE_CANVAS_OPEN_EVENT } from "../../ImageCanvas";
import {
  MentionChip,
  MentionPicker,
  applyMentionBackspace,
  buildMentionCandidates,
  getMentionQuery,
  selectMentionCandidate,
} from "./MentionPicker";

export const PROMPT_INPUT_ID = "primary-prompt-input";
export const PROMPT_INPUT_EVENT = "set_prompt_input";
const MAX_EDIT_STACK_SIZE = 100;

export default function PromptInput({
  submit,
  onChange,
  isStreaming,
  sendCommand,
  attachments = [],
  selectedAssistantId = null, // 接收选中的AI员工ID
  workspaceSlug = null, // 接收workspace slug
  isVoiceMode = false, // 语音模式状态
  mentionSelections = [],
  onMentionSelectionsChange = () => {},
}) {
  const { t } = useTranslation();
  const { isDisabled } = useIsDisabled();
  const [promptInput, setPromptInput] = useState("");
  const { showSlashCommand, setShowSlashCommand } = useSlashCommands();
  const formRef = useRef(null);
  const textareaRef = useRef(null);
  const [_, setFocused] = useState(false);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const { textSizeClass } = useTextSize();
  const isAgentSessionActive = useIsAgentSessionActive(); // 监听 Agent 会话状态

  // 获取当前选中助手的信息，判断是否为外部助手
  const [_selectedAssistant, setSelectedAssistant] = useState(null);
  const [isExternalAssistant, setIsExternalAssistant] = useState(false);
  const [mentionCandidates, setMentionCandidates] = useState([]);
  const mentionQuery = getMentionQuery(promptInput);
  const showMentionPicker = mentionQuery !== null;

  useEffect(() => {
    async function fetchAssistantInfo() {
      if (!selectedAssistantId || !workspaceSlug) {
        setSelectedAssistant(null);
        setIsExternalAssistant(false);
        return;
      }

      try {
        const result = await WorkspaceAssistant.list(workspaceSlug);
        if (result.success) {
          const assistant = result.data.assistants.find(
            (a) => String(a.id) === String(selectedAssistantId)
          );
          setSelectedAssistant(assistant);

          // 判断是否为外部助手（platformType 不为 "internal" 或 null）
          const platformType = assistant?.template?.platformType;
          const isExternal = platformType && platformType !== "internal";
          setIsExternalAssistant(isExternal);
        }
      } catch (error) {
        console.error("Failed to fetch assistant info:", error);
        setIsExternalAssistant(false);
      }
    }

    fetchAssistantInfo();
  }, [selectedAssistantId, workspaceSlug]);

  useEffect(() => {
    let cancelled = false;
    async function loadMentionCandidates() {
      if (!workspaceSlug) {
        setMentionCandidates([]);
        return;
      }

      try {
        const [assistantResult, moltResult] = await Promise.all([
          WorkspaceAssistant.list(workspaceSlug),
          Molt.workspaceAgents(workspaceSlug),
        ]);
        if (cancelled) return;
        setMentionCandidates(
          buildMentionCandidates({
            nativeAssistants: assistantResult?.success
              ? assistantResult?.data?.assistants || []
              : [],
            moltAgents: moltResult?.success ? moltResult?.agents || [] : [],
          })
        );
      } catch (error) {
        console.error("Failed to load mention candidates:", error);
        if (!cancelled) setMentionCandidates([]);
      }
    }

    loadMentionCandidates();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  /**
   * To prevent too many re-renders we remotely listen for updates from the parent
   * via an event cycle. Otherwise, using message as a prop leads to a re-render every
   * change on the input.
   * @param {{detail: {messageContent: string, writeMode: 'replace' | 'append'}}} e
   */
  function handlePromptUpdate(e) {
    const { messageContent, writeMode = "replace" } = e?.detail ?? {};
    let newValue;
    if (writeMode === "append") {
      setPromptInput((prev) => {
        newValue = prev + messageContent;
        return newValue;
      });
    } else {
      newValue = messageContent ?? "";
      setPromptInput(newValue);
    }
    // 同步触发 onChange，确保父组件状态更新
    setTimeout(() => {
      onChange({ target: { value: newValue } });
    }, 0);
  }

  useEffect(() => {
    if (!!window)
      window.addEventListener(PROMPT_INPUT_EVENT, handlePromptUpdate);
    return () =>
      window?.removeEventListener(PROMPT_INPUT_EVENT, handlePromptUpdate);
  }, []);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) textareaRef.current.focus();
    resetTextAreaHeight();
  }, [isStreaming]);

  /**
   * Save the current state before changes
   * @param {number} adjustment
   */
  function saveCurrentState(adjustment = 0) {
    if (undoStack.current.length >= MAX_EDIT_STACK_SIZE)
      undoStack.current.shift();
    undoStack.current.push({
      value: promptInput,
      cursorPositionStart: textareaRef.current.selectionStart + adjustment,
      cursorPositionEnd: textareaRef.current.selectionEnd + adjustment,
    });
  }
  const debouncedSaveState = debounce(saveCurrentState, 250);

  function handleSubmit(e) {
    setFocused(false);
    submit(e);
  }

  function resetTextAreaHeight() {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
  }

  function checkForSlash(e) {
    const input = e.target.value;
    if (input === "/") setShowSlashCommand(true);
    if (showSlashCommand) setShowSlashCommand(false);
    return;
  }
  const watchForSlash = debounce(checkForSlash, 300);

  /**
   * Capture enter key press to handle submission, redo, or undo
   * via keyboard shortcuts
   * @param {KeyboardEvent} event
   */
  function captureEnterOrUndo(event) {
    const backspaceResult = applyMentionBackspace({
      key: event.key,
      text: promptInput,
      mentions: mentionSelections,
    });
    if (backspaceResult.handled) {
      event.preventDefault();
      onMentionSelectionsChange(backspaceResult.mentions);
      return;
    }

    // Is simple enter key press w/o shift key
    if (event.keyCode === 13 && !event.shiftKey) {
      event.preventDefault();
      if (isStreaming || isDisabled) return; // Prevent submission if streaming or disabled
      return submit(event);
    }

    // Is undo with Ctrl+Z or Cmd+Z + Shift key = Redo
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "z" &&
      event.shiftKey
    ) {
      event.preventDefault();
      if (redoStack.current.length === 0) return;

      const nextState = redoStack.current.pop();
      if (!nextState) return;

      undoStack.current.push({
        value: promptInput,
        cursorPositionStart: textareaRef.current.selectionStart,
        cursorPositionEnd: textareaRef.current.selectionEnd,
      });
      setPromptInput(nextState.value);
      setTimeout(() => {
        textareaRef.current.setSelectionRange(
          nextState.cursorPositionStart,
          nextState.cursorPositionEnd
        );
      }, 0);
    }

    // Undo with Ctrl+Z or Cmd+Z
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "z" &&
      !event.shiftKey
    ) {
      if (undoStack.current.length === 0) return;
      const lastState = undoStack.current.pop();
      if (!lastState) return;

      redoStack.current.push({
        value: promptInput,
        cursorPositionStart: textareaRef.current.selectionStart,
        cursorPositionEnd: textareaRef.current.selectionEnd,
      });
      setPromptInput(lastState.value);
      setTimeout(() => {
        textareaRef.current.setSelectionRange(
          lastState.cursorPositionStart,
          lastState.cursorPositionEnd
        );
      }, 0);
    }
  }

  function adjustTextArea(event) {
    const element = event.target;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }

  function handlePasteEvent(e) {
    e.preventDefault();
    if (e.clipboardData.items.length === 0) return false;

    // paste any clipboard items that are images.
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        window.dispatchEvent(
          new CustomEvent(PASTE_ATTACHMENT_EVENT, {
            detail: { files: [file] },
          })
        );
        continue;
      }

      // handle files specifically that are not images as uploads
      if (item.kind === "file") {
        const file = item.getAsFile();
        window.dispatchEvent(
          new CustomEvent(PASTE_ATTACHMENT_EVENT, {
            detail: { files: [file] },
          })
        );
        continue;
      }
    }

    const pasteText = e.clipboardData.getData("text/plain");
    if (pasteText) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newPromptInput =
        promptInput.substring(0, start) +
        pasteText +
        promptInput.substring(end);
      setPromptInput(newPromptInput);
      onChange({ target: { value: newPromptInput } });

      // Set the cursor position after the pasted text
      // we need to use setTimeout to prevent the cursor from being set to the end of the text
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd =
          start + pasteText.length;
        adjustTextArea({ target: textarea });
      }, 0);
    }
    return;
  }

  function handleChange(e) {
    debouncedSaveState(-1);
    onChange(e);
    watchForSlash(e);
    adjustTextArea(e);
    setPromptInput(e.target.value);
  }

  function handleMentionSelect(candidate) {
    const result = selectMentionCandidate({
      currentText: promptInput,
      currentMentions: mentionSelections,
      candidate,
    });
    setPromptInput(result.text);
    onChange({ target: { value: result.text } });
    onMentionSelectionsChange(result.mentions);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function removeMention(mention) {
    onMentionSelectionsChange(
      mentionSelections.filter(
        (item) => !(item.type === mention.type && item.id === mention.id)
      )
    );
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  return (
    <div className="w-full relative z-10 md:z-0 flex justify-center items-center pt-2 pb-4 md:pb-6 bg-theme-bg-chat">
      <SlashCommands
        showing={showSlashCommand}
        setShowing={setShowSlashCommand}
        sendCommand={sendCommand}
        promptRef={textareaRef}
      />

      <form
        onSubmit={handleSubmit}
        className="chat-column flex flex-col gap-y-1 items-center"
      >
        <div className="flex items-center rounded-lg mb-2 md:mb-2 md:w-full">
          <div className="w-full bg-theme-bg-chat-input shadow-sm rounded-2xl flex flex-col px-2 overflow-hidden border border-theme-chat-input-border">
            <AttachmentManager attachments={attachments} />
            {mentionSelections.length > 0 && (
              <div className="mx-3 mt-3 flex flex-wrap gap-2">
                {mentionSelections.map((mention) => (
                  <MentionChip
                    key={`${mention.type}:${mention.id}`}
                    mention={mention}
                    onRemove={removeMention}
                    t={t}
                  />
                ))}
              </div>
            )}
            {showMentionPicker && (
              <MentionPicker
                candidates={mentionCandidates}
                query={mentionQuery}
                onSelect={handleMentionSelect}
                t={t}
              />
            )}
            <div className="flex items-center mx-3">
              <textarea
                id={PROMPT_INPUT_ID}
                ref={textareaRef}
                onChange={handleChange}
                onKeyDown={captureEnterOrUndo}
                onPaste={(e) => {
                  saveCurrentState();
                  handlePasteEvent(e);
                }}
                required={true}
                onFocus={() => setFocused(true)}
                onBlur={(e) => {
                  setFocused(false);
                  adjustTextArea(e);
                }}
                value={promptInput}
                spellCheck={Appearance.get("enableSpellCheck")}
                className={`border-none cursor-text max-h-[50vh] md:max-h-[240px] md:min-h-[52px] mx-2 md:mx-0 pt-[12px] w-full leading-5 md:text-md text-theme-text-primary bg-transparent placeholder:text-theme-settings-input-placeholder resize-none active:outline-none focus:outline-none flex-grow mb-1 ${textSizeClass}`}
                placeholder={t("chat_window.send_message")}
              />
              {isStreaming || isAgentSessionActive ? (
                <StopGenerationButton />
              ) : (
                <>
                  <button
                    ref={formRef}
                    type="submit"
                    disabled={isDisabled}
                    className={`border-none inline-flex justify-center rounded-2xl cursor-pointer ml-4 disabled:cursor-not-allowed group transition-opacity ${promptInput.trim() ? "opacity-100" : "opacity-40 cursor-not-allowed"}`}
                    data-tooltip-id="send-prompt"
                    data-tooltip-content={
                      isDisabled
                        ? t("chat_window.attachments_processing")
                        : t("chat_window.send")
                    }
                    aria-label={t("chat_window.send")}
                  >
                    <PaperPlaneRight
                      color="var(--theme-sidebar-footer-icon-fill)"
                      className="w-[22px] h-[22px] pointer-events-none text-theme-text-primary group-disabled:opacity-[25%]"
                      weight="fill"
                    />
                    <span className="sr-only">Send message</span>
                  </button>
                  <Tooltip
                    id="send-prompt"
                    place="bottom"
                    delayShow={300}
                    className="tooltip !text-xs z-99"
                  />
                </>
              )}
            </div>
            <div className="flex items-center gap-x-2 py-2.5 px-3 mb-1">
              {/* Group 1: Core Inputs */}
              <div className="flex items-center gap-x-2">
                <AttachItem />
                <ResponseStyleButton />
                <SlashCommandsButton
                  showing={showSlashCommand}
                  setShowSlashCommand={setShowSlashCommand}
                />
              </div>

              <div className="w-px h-5 bg-theme-border-subtle mx-1" />

              {/* Group 2: Advanced Capabilities */}
              <div className="flex items-center gap-x-2">
                {workspaceSlug && (
                  <GraphButtonAction workspaceSlug={workspaceSlug} />
                )}
                <AnalysisDataButton
                  workspaceSlug={workspaceSlug}
                  selectedAssistant={_selectedAssistant}
                />
                {workspaceSlug && <ImageCanvasButtonAction />}
                <ScheduledTasksButton workspaceSlug={workspaceSlug} />
              </div>

              <div className="w-px h-5 bg-theme-border-subtle mx-1" />

              {/* Group 3: Model Control */}
              <div className="flex items-center gap-x-2">
                {!isExternalAssistant && (
                  <LLMSelectorAction
                    target={
                      selectedAssistantId && !isExternalAssistant
                        ? "agent"
                        : "chat"
                    }
                  />
                )}
              </div>

              {/* Right side: Speech + Send grouped via ml-auto */}
              <div className="flex items-center gap-x-2 ml-auto">
                <SpeechToText
                  sendCommand={sendCommand}
                  isVoiceMode={isVoiceMode}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

/**
 * Handle event listeners to prevent the send button from being used
 * for whatever reason that may we may want to prevent the user from sending a message.
 */
function useIsDisabled() {
  const [isDisabled, setIsDisabled] = useState(false);

  /**
   * Handle attachments processing and processed events
   * to prevent the send button from being clicked when attachments are processing
   * or else the query may not have relevant context since RAG is not yet ready.
   */
  useEffect(() => {
    if (!window) return;
    window.addEventListener(ATTACHMENTS_PROCESSING_EVENT, () =>
      setIsDisabled(true)
    );
    window.addEventListener(ATTACHMENTS_PROCESSED_EVENT, () =>
      setIsDisabled(false)
    );

    return () => {
      window?.removeEventListener(ATTACHMENTS_PROCESSING_EVENT, () =>
        setIsDisabled(true)
      );
      window?.removeEventListener(ATTACHMENTS_PROCESSED_EVENT, () =>
        setIsDisabled(false)
      );
    };
  }, []);

  return { isDisabled };
}

/**
 * 知识图谱按钮 - 工具栏版本
 */
function GraphButtonAction({ workspaceSlug }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(paths.workspace.graph(workspaceSlug));
  };

  return (
    <button
      id="graph-btn"
      type="button"
      data-tooltip-id="tooltip-graph-btn"
      data-tooltip-content={t("chat_window.knowledge_graph") || "知识图谱"}
      aria-label={t("chat_window.knowledge_graph") || "知识图谱"}
      onClick={handleClick}
      className="flex justify-center items-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--theme-accent-primary)] rounded-lg transition-all duration-200"
    >
      <Graph
        color="var(--theme-sidebar-footer-icon-fill)"
        className="w-[22px] h-[22px] pointer-events-none text-theme-text-primary opacity-60 hover:opacity-100 light:opacity-100 light:hover:opacity-60"
      />
      <Tooltip
        id="tooltip-graph-btn"
        place="top"
        delayShow={300}
        className="allm-tooltip !allm-text-xs"
      />
    </button>
  );
}

/**
 * 图像画布按钮 - 工具栏版本
 */
function ImageCanvasButtonAction() {
  const { t } = useTranslation();

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent(IMAGE_CANVAS_OPEN_EVENT));
  };

  return (
    <button
      id="image-canvas-btn"
      type="button"
      data-tooltip-id="tooltip-image-canvas-btn"
      data-tooltip-content={t("chat_window.image_canvas") || "图像画布"}
      aria-label={t("chat_window.image_canvas") || "图像画布"}
      onClick={handleClick}
      className="flex justify-center items-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--theme-accent-primary)] rounded-lg transition-all duration-200"
    >
      <ImageIcon
        color="var(--theme-sidebar-footer-icon-fill)"
        className="w-[22px] h-[22px] pointer-events-none text-theme-text-primary opacity-60 hover:opacity-100 light:opacity-100 light:hover:opacity-60"
      />
      <Tooltip
        id="tooltip-image-canvas-btn"
        place="top"
        delayShow={300}
        className="allm-tooltip !allm-text-xs"
      />
    </button>
  );
}
