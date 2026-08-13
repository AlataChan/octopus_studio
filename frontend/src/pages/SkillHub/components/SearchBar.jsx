import React from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";

export default function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="flex-grow relative">
      <MagnifyingGlass
        size={20}
        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-theme-text-secondary"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder || "搜索 Skill..."}
        className="w-full pl-10 pr-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
      />
    </div>
  );
}
