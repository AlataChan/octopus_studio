import { middleTruncate } from "@/utils/directories";

export default function FolderSelectionPopup({ folders, onSelect, onClose }) {
  const handleFolderSelect = (folder) => {
    onSelect(folder);
    onClose();
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg max-h-40 overflow-y-auto no-scroll">
      <ul>
        {folders.map((folder) => (
          <li
            key={folder.name}
            onClick={() => handleFolderSelect(folder)}
            className="px-4 py-2 text-xs text-theme-text-primary hover:bg-theme-bg-primary rounded-lg cursor-pointer whitespace-nowrap"
          >
            {middleTruncate(folder.name, 25)}
          </li>
        ))}
      </ul>
    </div>
  );
}
