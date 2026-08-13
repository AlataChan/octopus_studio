import React from "react";
import renderMarkdown from "@/utils/chat/markdown";

/**
 * Markdown Renderer Component
 *
 * Phase J: Markdown 渲染器
 * 用于展示富文本内容
 */
export default function MarkdownRenderer({ data, title }) {
  if (!data?.content || typeof data.content !== "string") {
    return <p className="text-red-400 text-sm">Markdown 数据格式错误</p>;
  }

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <div
        className="text-white/90 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_code]:bg-theme-settings-input-bg [&_code]:px-1 [&_code]:rounded [&_pre]:bg-theme-bg-secondary [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-auto [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_a]:text-blue-400 [&_a]:hover:underline"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(data.content) }}
      />
    </div>
  );
}
