import React from "react";
import { FileArrowDown } from "@phosphor-icons/react";

/**
 * Table Renderer Component
 *
 * Phase J: 表格渲染器
 * 支持导出 CSV 功能
 */
export default function TableRenderer({ data, title }) {
  if (!data?.headers || !data?.rows) {
    return <p className="text-red-400 text-sm">表格数据格式错误</p>;
  }

  const exportToCSV = () => {
    const csv = [
      data.headers.join(","),
      ...data.rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "table"}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={exportToCSV}
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
        >
          <FileArrowDown size={16} />
          导出 CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-600">
          <thead className="bg-zinc-700/50">
            <tr>
              {data.headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-4 py-2 text-left text-xs font-medium text-theme-text-secondary uppercase tracking-wider"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-zinc-800/30 divide-y divide-zinc-700">
            {data.rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="hover:bg-zinc-700/30 transition-colors"
              >
                {row.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className="px-4 py-2 text-sm text-zinc-200 whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500 mt-2">共 {data.rows.length} 行数据</p>
    </div>
  );
}
