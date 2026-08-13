import React from "react";
import { FunnelSimple } from "@phosphor-icons/react";

export default function CategoryFilter({ value, onChange, categories = [] }) {
  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <FunnelSimple size={20} className="text-theme-text-secondary" />
      <select
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        className="flex-grow bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
      >
        <option value="">全部分类</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
