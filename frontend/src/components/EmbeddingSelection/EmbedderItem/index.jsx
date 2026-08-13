export default function EmbedderItem({
  name,
  value,
  image,
  description,
  checked,
  onClick,
  tags = [],
}) {
  return (
    <div
      onClick={() => onClick(value)}
      className={`w-full p-2 rounded-md hover:cursor-pointer hover:bg-theme-bg-secondary ${
        checked ? "bg-theme-bg-secondary" : ""
      }`}
    >
      <input
        type="checkbox"
        value={value}
        className="peer hidden"
        checked={checked}
        readOnly={true}
        formNoValidate={true}
      />
      <div className="flex gap-x-4 items-start">
        <img
          src={image}
          alt={`${name} logo`}
          className="w-10 h-10 rounded-md flex-shrink-0"
        />
        <div className="flex flex-col flex-1 min-w-0">
          <div className="text-sm font-semibold text-theme-text-primary">
            {name}
          </div>
          <div className="mt-1 text-xs text-description break-words">
            {description}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag) => {
                // 根据标签类型设置不同颜色
                let colorClass =
                  "bg-blue-500/15 text-blue-400 border-blue-500/30";
                if (tag === "本地部署") {
                  colorClass =
                    "bg-green-500/15 text-green-400 border-green-500/30";
                } else if (tag === "API") {
                  colorClass =
                    "bg-purple-500/15 text-purple-400 border-purple-500/30";
                } else if (tag === "中文优化") {
                  colorClass =
                    "bg-orange-500/15 text-orange-400 border-orange-500/30";
                } else if (tag === "多语言") {
                  colorClass =
                    "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
                }

                return (
                  <span
                    key={tag}
                    className={`text-xs font-medium px-2 py-0.5 rounded border ${colorClass}`}
                  >
                    {tag}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
