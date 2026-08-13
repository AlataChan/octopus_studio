import React from "react";
import TableRenderer from "./TableRenderer";
import ChartRenderer from "./ChartRenderer";
import CardsRenderer from "./CardsRenderer";
import TimelineRenderer from "./TimelineRenderer";
import MarkdownRenderer from "./MarkdownRenderer";

/**
 * Structured Output Component
 *
 * Phase J: 结构化输出渲染器
 * 根据输出类型渲染不同的可视化组件
 */
export default function StructuredOutput({ output }) {
  if (!output || !output.data) return null;

  const renderByType = () => {
    switch (output.outputType) {
      case "table":
        return <TableRenderer data={output.data} title={output.title} />;
      case "chart":
        return (
          <ChartRenderer
            data={output.data}
            title={output.title}
            chartType={output.chartType}
          />
        );
      case "cards":
        return <CardsRenderer data={output.data} title={output.title} />;
      case "timeline":
        return <TimelineRenderer data={output.data} title={output.title} />;
      case "markdown":
        return <MarkdownRenderer data={output.data} title={output.title} />;
      default:
        return (
          <pre className="text-xs overflow-auto bg-theme-bg-secondary p-3 rounded">
            {JSON.stringify(output.data, null, 2)}
          </pre>
        );
    }
  };

  return (
    <div className="bg-zinc-800/50 rounded-lg border border-theme-modal-border p-4 my-4">
      {output.title && (
        <h4 className="text-lg font-semibold mb-3 text-theme-text-primary">
          {output.title}
        </h4>
      )}
      {renderByType()}
    </div>
  );
}
