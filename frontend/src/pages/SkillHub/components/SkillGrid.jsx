import React from "react";

export default function SkillGrid({ children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4 md:p-8">
      {children}
    </div>
  );
}
