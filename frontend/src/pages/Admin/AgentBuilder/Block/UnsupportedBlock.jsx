import React from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

const UNSUPPORTED_BLOCK_TYPES = new Set(["website", "file", "code"]);

function isUnsupportedBlockType(blockType) {
  return UNSUPPORTED_BLOCK_TYPES.has(blockType);
}

function blockSummary(blockData) {
  let serialized = "";

  try {
    serialized = JSON.stringify(blockData ?? {}, null, 2);
  } catch {
    serialized = String(blockData ?? "");
  }

  return serialized.length > 120
    ? `${serialized.slice(0, 120)}...`
    : serialized;
}

export default function UnsupportedBlock({ blockType, blockData }) {
  const { t } = useTranslation();
  const summary = blockSummary(blockData);

  return (
    <div className="rounded-lg border border-theme-border bg-theme-bg-primary/60 p-4 text-theme-text-primary">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-300">
          <WarningCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-theme-text-primary">
            {t("agent-builder.unsupported-block.title", {
              blockType,
              defaultValue: `此版本不支持的块类型: ${blockType}`,
            })}
          </p>
          <p className="mt-1 text-xs text-theme-text-secondary">
            {t("agent-builder.unsupported-block.hint", {
              defaultValue: "保留原始数据；如需移除请删除该块",
            })}
          </p>
          <pre className="mt-3 max-h-24 overflow-hidden rounded-md border border-theme-border bg-theme-bg-secondary p-3 text-xs text-theme-text-secondary whitespace-pre-wrap break-words">
            {summary}
          </pre>
        </div>
      </div>
    </div>
  );
}

export { isUnsupportedBlockType };
