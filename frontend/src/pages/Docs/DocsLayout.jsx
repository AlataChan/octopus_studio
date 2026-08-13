import React from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";

/**
 * 文档页面布局组件
 * 提供统一的文档页面样式和返回按钮
 */
export default function DocsLayout({ title, children }) {
  const navigate = useNavigate();

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <div className="relative z-[1] flex-1 flex flex-col overflow-hidden">
        {/* 顶部导航栏 */}
        <div className="flex items-center gap-x-4 px-6 py-4 border-b border-theme-border">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-x-2 text-theme-text-secondary hover:text-theme-text-primary transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm">返回</span>
          </button>
          <h1 className="text-xl font-semibold text-theme-text-primary">
            {title}
          </h1>
        </div>

        {/* 文档内容区域 */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl mx-auto">
            <div className="prose prose-invert max-w-none">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
