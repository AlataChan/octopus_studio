import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

/**
 * Chart Renderer Component
 *
 * Phase J: 图表渲染器
 * 支持折线图、柱状图、饼图、面积图
 */

const COLORS = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // yellow
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

export default function ChartRenderer({ data, title, chartType = "line" }) {
  if (!data?.labels || !data?.datasets) {
    return <p className="text-red-400 text-sm">图表数据格式错误</p>;
  }

  // 转换数据格式为 Recharts 需要的格式
  const chartData = data.labels.map((label, idx) => {
    const point = { name: label };
    data.datasets.forEach((dataset) => {
      point[dataset.label] = dataset.data[idx];
    });
    return point;
  });

  // 饼图数据格式
  const pieData = data.datasets[0]?.data.map((value, idx) => ({
    name: data.labels[idx],
    value: value,
  }));

  const renderChart = () => {
    switch (chartType) {
      case "line":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#F3F4F6" }}
              />
              <Legend />
              {data.datasets.map((dataset, idx) => (
                <Line
                  key={dataset.label}
                  type="monotone"
                  dataKey={dataset.label}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                  dot={{ fill: COLORS[idx % COLORS.length], strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case "bar":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#F3F4F6" }}
              />
              <Legend />
              {data.datasets.map((dataset, idx) => (
                <Bar
                  key={dataset.label}
                  dataKey={dataset.label}
                  fill={COLORS[idx % COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case "pie":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name}: ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={COLORS[idx % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case "area":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#F3F4F6" }}
              />
              <Legend />
              {data.datasets.map((dataset, idx) => (
                <Area
                  key={dataset.label}
                  type="monotone"
                  dataKey={dataset.label}
                  stroke={COLORS[idx % COLORS.length]}
                  fill={COLORS[idx % COLORS.length]}
                  fillOpacity={0.3}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      default:
        return (
          <p className="text-theme-text-secondary">
            不支持的图表类型: {chartType}
          </p>
        );
    }
  };

  return (
    <div>
      {renderChart()}
      <p className="text-xs text-zinc-500 mt-2 text-center">
        {chartType === "line" && "折线图"}
        {chartType === "bar" && "柱状图"}
        {chartType === "pie" && "饼图"}
        {chartType === "area" && "面积图"}
        {" • "}
        {data.datasets.length} 个数据集
      </p>
    </div>
  );
}
