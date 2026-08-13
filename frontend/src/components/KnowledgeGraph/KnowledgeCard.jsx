import React from "react";
import {
  X,
  Info,
  User,
  FileText,
  ChatCircle,
  Tag,
} from "@phosphor-icons/react";

/**
 * Knowledge Card Component
 * A glassmorphism side panel for displaying node details.
 */
export default function KnowledgeCard({ node, onClose }) {
  if (!node) return null;

  const { label, type, metadata } = node;

  // Icon mapping
  const Icon =
    {
      assistant: User,
      doc: FileText,
      chat: ChatCircle,
      tag: Tag,
    }[type] || Info;

  // Color mapping
  const colorClass =
    {
      assistant: "text-purple-400",
      doc: "text-blue-400",
      chat: "text-green-400",
      tag: "text-orange-400",
    }[type] || "text-theme-text-secondary";

  return (
    <div className="absolute top-20 right-6 w-80 bg-theme-bg-secondary/90 backdrop-blur-xl border border-theme-sidebar-border rounded-xl shadow-2xl overflow-hidden animate-slide-in-right z-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-sidebar-border bg-white/5">
        <div className="flex items-center gap-2">
          <Icon size={20} className={colorClass} weight="duotone" />
          <span className="text-sm font-bold text-theme-text-primary uppercase tracking-wider">
            {type.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-theme-text-secondary hover:text-theme-text-primary transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
        {/* Title */}
        <div>
          <h3 className="text-lg font-semibold text-theme-text-primary leading-tight">
            {label}
          </h3>
        </div>

        {/* Metadata Fields */}
        <div className="space-y-3">
          {metadata &&
            Object.entries(metadata).map(([key, value]) => {
              if (key === "avatar") return null; // Skip avatar url

              return (
                <div key={key} className="group">
                  <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-1 opacity-70 group-hover:opacity-100 transition-opacity">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  <div className="text-sm text-theme-text-primary bg-black/20 rounded p-2 border border-white/5 break-words font-mono">
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Actions (Placeholder) */}
        <div className="pt-4 border-t border-theme-sidebar-border flex gap-2">
          <button className="flex-1 px-3 py-2 bg-theme-button-primary hover:bg-theme-button-primary/80 text-theme-text-primary text-xs font-bold rounded uppercase tracking-wide transition-colors">
            Open
          </button>
          <button className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-theme-text-primary text-xs font-bold rounded uppercase tracking-wide transition-colors">
            Trace
          </button>
        </div>
      </div>
    </div>
  );
}
