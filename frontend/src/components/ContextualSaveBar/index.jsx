import Button from "@/components/Button";
import { Warning } from "@phosphor-icons/react";

export default function ContextualSaveBar({
  showing = false,
  onSave,
  onCancel,
}) {
  if (!showing) return null;

  return (
    <div className="fixed top-0 left-0 right-0 h-14 bg-theme-bg-chat-input flex items-center justify-end px-4 z-[999]">
      <div className="absolute ml-4 left-0 md:left-1/2 transform md:-translate-x-1/2 flex items-center gap-x-2">
        <Warning size={18} className="text-theme-stroke-primary" />
        <p className="text-theme-text-primary font-medium text-xs">
          Unsaved Changes
        </p>
      </div>
      <div className="flex items-center gap-x-2">
        <Button onClick={onCancel} size="sm" variant="secondary">
          Cancel
        </Button>
        <Button onClick={onSave} size="sm" variant="primary">
          Save
        </Button>
      </div>
    </div>
  );
}
