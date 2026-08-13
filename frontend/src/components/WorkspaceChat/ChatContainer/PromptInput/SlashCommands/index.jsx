import { useEffect, useRef, useState } from "react";
import SlashCommandIcon from "./icons/SlashCommandIcon";
import { Tooltip } from "react-tooltip";
import ResetCommand from "./reset";
import EndAgentSession from "./endAgentSession";
import SlashPresets from "./SlashPresets";
import ToolsCommand from "./ToolsCommand";
import FlowCommand from "./FlowCommand";
import MCPStatusCommand from "./MCPStatusCommand";
import { useTranslation } from "react-i18next";
import { useSlashCommandKeyboardNavigation } from "@/hooks/useSlashCommandKeyboardNavigation";

export default function SlashCommandsButton({ showing, setShowSlashCommand }) {
  const { t } = useTranslation();
  return (
    <button
      id="slash-cmd-btn"
      type="button"
      data-tooltip-id="tooltip-slash-cmd-btn"
      data-tooltip-content={t("chat_window.slash")}
      aria-label={t("chat_window.slash")}
      onClick={() => setShowSlashCommand(!showing)}
      className={`border-none flex justify-center items-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--theme-accent-primary)] rounded-lg transition-all duration-200 ${
        showing ? "!opacity-100" : ""
      }`}
    >
      <SlashCommandIcon
        color="var(--theme-sidebar-footer-icon-fill)"
        className={`w-[20px] h-[20px] pointer-events-none opacity-60 hover:opacity-100 light:opacity-100 light:hover:opacity-60`}
      />
      <Tooltip
        id="tooltip-slash-cmd-btn"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </button>
  );
}

export function SlashCommands({ showing, setShowing, sendCommand, promptRef }) {
  const cmdRef = useRef(null);
  useSlashCommandKeyboardNavigation({ showing });

  useEffect(() => {
    function listenForOutsideClick() {
      if (!showing || !cmdRef.current) return false;
      document.addEventListener("click", closeIfOutside);
    }
    listenForOutsideClick();
  }, [showing, cmdRef.current]);

  const closeIfOutside = ({ target }) => {
    if (target.id === "slash-cmd-btn") return;
    const isOutside = !cmdRef?.current?.contains(target);
    if (!isOutside) return;
    setShowing(false);
  };

  return (
    <div hidden={!showing}>
      <div className="w-full flex justify-center absolute bottom-[130px] md:bottom-[150px] left-0 z-10 px-4">
        <div
          ref={cmdRef}
          className="w-[600px] bg-theme-action-menu-bg rounded-2xl flex shadow flex-col justify-start items-start gap-2.5 p-2 overflow-y-auto max-h-[400px] no-scroll"
        >
          {/* 系统命令 */}
          <ResetCommand sendCommand={sendCommand} setShowing={setShowing} />
          <EndAgentSession sendCommand={sendCommand} setShowing={setShowing} />

          {/* Agent 状态查询命令 */}
          <div className="w-full border-t border-theme-border pt-2 mt-1">
            <div className="text-xs text-theme-text-secondary opacity-60 px-2 mb-1">Agent 状态</div>
            <ToolsCommand sendCommand={sendCommand} setShowing={setShowing} />
            <FlowCommand sendCommand={sendCommand} setShowing={setShowing} />
            <MCPStatusCommand
              sendCommand={sendCommand}
              setShowing={setShowing}
            />
          </div>

          {/* 用户预设 */}
          <SlashPresets
            sendCommand={sendCommand}
            setShowing={setShowing}
            promptRef={promptRef}
          />
        </div>
      </div>
    </div>
  );
}

export function useSlashCommands() {
  const [showSlashCommand, setShowSlashCommand] = useState(false);
  return { showSlashCommand, setShowSlashCommand };
}
