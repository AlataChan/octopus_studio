import { useEffect, useCallback, useRef } from "react";
import { Microphone } from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import _regeneratorRuntime from "regenerator-runtime";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { PROMPT_INPUT_EVENT } from "../../PromptInput";
import { useTranslation } from "react-i18next";
import Appearance from "@/models/appearance";

let timeout;
const SILENCE_INTERVAL = 3_200; // wait in seconds of silence before closing.

/**
 * Speech-to-text input component for the chat window.
 * @param {Object} props - The component props
 * @param {(textToAppend: string, autoSubmit: boolean) => void} props.sendCommand - The function to send the command
 * @param {boolean} props.isVoiceMode - 语音模式是否开启（由 AssistantSelector 控制）
 * @returns {React.ReactElement} The SpeechToText component
 */
export default function SpeechToText({ sendCommand, isVoiceMode = false }) {
  const previousTranscriptRef = useRef("");
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    browserSupportsContinuousListening,
    isMicrophoneAvailable,
  } = useSpeechRecognition({
    clearTranscriptOnListen: true,
  });
  const { t } = useTranslation();
  function startSTTSession() {
    if (!isMicrophoneAvailable) {
      alert(
        "Octopus Studio does not have access to microphone. Please enable for this site to use this feature."
      );
      return;
    }

    resetTranscript();
    previousTranscriptRef.current = "";
    SpeechRecognition.startListening({
      continuous: browserSupportsContinuousListening,
      language: window?.navigator?.language ?? "en-US",
    });
  }

  function endSTTSession() {
    SpeechRecognition.stopListening();

    // If auto submit is enabled, send an empty string to the chat window to submit the current transcript
    // since every chunk of text should have been streamed to the chat window by now.
    if (Appearance.get("autoSubmitSttInput")) {
      sendCommand({
        text: "",
        autoSubmit: true,
        writeMode: "append",
      });
    }

    resetTranscript();
    previousTranscriptRef.current = "";
    clearTimeout(timeout);
  }

  const handleKeyPress = useCallback(
    (event) => {
      // CTRL + m on Mac and Windows to toggle STT listening
      if (event.ctrlKey && event.keyCode === 77) {
        if (listening) {
          endSTTSession();
        } else {
          startSTTSession();
        }
      }
    },
    [listening, endSTTSession, startSTTSession]
  );

  function handlePromptUpdate(e) {
    if (!e?.detail && timeout) {
      endSTTSession();
      clearTimeout(timeout);
    }
  }

  useEffect(() => {
    document.addEventListener("keydown", handleKeyPress);
    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [handleKeyPress]);

  useEffect(() => {
    if (!!window)
      window.addEventListener(PROMPT_INPUT_EVENT, handlePromptUpdate);
    return () =>
      window?.removeEventListener(PROMPT_INPUT_EVENT, handlePromptUpdate);
  }, []);

  useEffect(() => {
    if (transcript?.length > 0 && listening) {
      const previousTranscript = previousTranscriptRef.current;
      const newContent = transcript.slice(previousTranscript.length);

      // Stream just the diff of the new content since transcript is an accumulating string.
      // and not just the new content transcribed.
      if (newContent.length > 0)
        sendCommand({ text: newContent, writeMode: "append" });

      previousTranscriptRef.current = transcript;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        endSTTSession();
      }, SILENCE_INTERVAL);
    }
  }, [transcript, listening]);

  // 语音模式自动控制：当 isVoiceMode 变化时自动启动/停止 STT
  useEffect(() => {
    if (isVoiceMode && !listening) {
      // 语音模式开启且未监听，启动 STT
      startSTTSession();
    } else if (!isVoiceMode && listening) {
      // 语音模式关闭且正在监听，停止 STT
      endSTTSession();
    }
  }, [isVoiceMode]);

  if (!browserSupportsSpeechRecognition) return null;
  return (
    <div
      data-tooltip-id="tooltip-microphone-btn"
      data-tooltip-content={`${t("chat_window.microphone")} (CTRL + M)`}
      aria-label={t("chat_window.microphone")}
      onClick={listening ? endSTTSession : startSTTSession}
      className={`border-none relative flex justify-center items-center opacity-60 hover:opacity-100 light:opacity-100 light:hover:opacity-60 cursor-pointer ${
        !!listening ? "!opacity-100" : ""
      }`}
    >
      <Microphone
        weight="fill"
        color="var(--theme-sidebar-footer-icon-fill)"
        className={`w-[22px] h-[22px] pointer-events-none text-theme-text-primary ${
          listening ? "animate-pulse-glow" : ""
        }`}
      />
      <Tooltip
        id="tooltip-microphone-btn"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </div>
  );
}
