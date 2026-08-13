import { useEffect, useState } from "react";
import Billing from "@/models/billing";
import { ChartLine, CaretLeft, CaretRight } from "@phosphor-icons/react";

/**
 * 使用记录组件
 * 显示用户的详细使用记录列表
 */
export default function UsageHistory() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    modelGroup: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    loadLogs();
  }, [page, filters]);

  const loadLogs = async () => {
    setLoading(true);
    const params = { page, limit: 20 };
    if (filters.modelGroup) params.modelGroup = filters.modelGroup;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;

    const res = await Billing.getMyUsage(params);
    if (res.success) {
      setLogs(res.data.logs || []);
      setTotalPages(res.data.totalPages || 1);
    }
    setLoading(false);
  };

  const modelGroupLabels = {
    premium: { label: "高端", color: "bg-purple-500/20 text-purple-400" },
    international: { label: "国际", color: "bg-blue-500/20 text-blue-400" },
    domestic: { label: "国内", color: "bg-green-500/20 text-green-400" },
  };

  return (
    <div className="bg-theme-bg-primary rounded-lg p-4">
      {/* 筛选器 */}
      <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b border-theme-border">
        <select
          value={filters.modelGroup}
          onChange={(e) =>
            setFilters({ ...filters, modelGroup: e.target.value })
          }
          className="bg-theme-bg-secondary text-theme-text-primary rounded-lg px-3 py-2 text-sm border border-theme-border"
        >
          <option value="">全部模型组</option>
          <option value="premium">高端模型</option>
          <option value="international">国际模型</option>
          <option value="domestic">国内模型</option>
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) =>
            setFilters({ ...filters, startDate: e.target.value })
          }
          className="bg-theme-bg-secondary text-theme-text-primary rounded-lg px-3 py-2 text-sm border border-theme-border"
          placeholder="开始日期"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          className="bg-theme-bg-secondary text-theme-text-primary rounded-lg px-3 py-2 text-sm border border-theme-border"
          placeholder="结束日期"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-button"></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <ChartLine className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>暂无使用记录</p>
        </div>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr className="text-left text-white/60 text-sm border-b border-theme-border">
                <th className="pb-3">时间</th>
                <th className="pb-3">模型</th>
                <th className="pb-3">分组</th>
                <th className="pb-3">输入</th>
                <th className="pb-3">输出</th>
                <th className="pb-3">消耗</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const groupInfo = modelGroupLabels[log.modelGroup] || {
                  label: log.modelGroup,
                  color: "bg-gray-500/20 text-theme-text-secondary",
                };
                return (
                  <tr
                    key={log.id}
                    className="border-b border-white/5 text-theme-text-primary text-sm"
                  >
                    <td className="py-3">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 font-mono text-xs">{log.modelName}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${groupInfo.color}`}
                      >
                        {groupInfo.label}
                      </span>
                    </td>
                    <td className="py-3 text-white/60">
                      {log.inputTokens?.toLocaleString()}
                    </td>
                    <td className="py-3 text-white/60">
                      {log.outputTokens?.toLocaleString()}
                    </td>
                    <td className="py-3 text-yellow-400">
                      {log.creditsUsed?.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 分页 */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-theme-border">
            <span className="text-sm text-white/60">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex gap-x-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CaretLeft className="h-4 w-4 text-theme-text-primary" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CaretRight className="h-4 w-4 text-theme-text-primary" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
