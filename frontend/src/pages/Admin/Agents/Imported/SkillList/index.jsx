import { CaretRight } from "@phosphor-icons/react";
import { sentenceCase } from "text-case";
import { Link } from "react-router-dom";
import paths from "@/utils/paths";

export default function ImportedSkillList({
  skills = [],
  selectedSkill = null,
  handleClick = null,
}) {
  if (skills.length === 0)
    return (
      <div className="text-theme-text-secondary text-center text-xs flex flex-col gap-y-2">
        <p>未找到已导入的技能</p>
        <p>
          了解如何开发自定义技能，请查看{" "}
          <Link
            to={paths.internalDocs.customSkills()}
            className="text-theme-text-secondary underline hover:text-cta-button"
          >
            自定义技能开发指南
          </Link>
        </p>
      </div>
    );

  return (
    <div
      className={`bg-theme-bg-secondary text-theme-text-primary rounded-xl w-full md:min-w-[360px]`}
    >
      {skills.map((config, index) => (
        <div
          key={config.hubId}
          className={`py-3 px-4 flex items-center justify-between ${
            index === 0 ? "rounded-t-xl" : ""
          } ${
            index === Object.keys(skills).length - 1
              ? "rounded-b-xl"
              : "border-b border-theme-border"
          } cursor-pointer transition-all duration-300 hover:bg-theme-bg-primary ${
            selectedSkill === config.hubId ? "bg-theme-bg-primary" : ""
          }`}
          onClick={() => handleClick?.({ ...config, imported: true })}
        >
          <div className="text-sm font-light">{sentenceCase(config.name)}</div>
          <div className="flex items-center gap-x-2">
            <div className="text-sm text-theme-text-secondary font-medium">
              {config.active ? "On" : "Off"}
            </div>
            <CaretRight
              size={14}
              weight="bold"
              className="text-theme-text-secondary"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
