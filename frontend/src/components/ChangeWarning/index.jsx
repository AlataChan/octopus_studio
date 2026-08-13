import { Warning, X } from "@phosphor-icons/react";
import Button from "@/components/Button";

export default function ChangeWarningModal({
  warningText = "",
  onClose,
  onConfirm,
}) {
  return (
    <div className="w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border overflow-hidden z-9999">
      <div className="relative px-6 py-5 border-b rounded-t border-theme-modal-border">
        <div className="w-full flex gap-x-2 items-center">
          <Warning className="text-red-500 w-6 h-6" weight="fill" />
          <h3 className="text-xl font-semibold text-red-500 overflow-hidden overflow-ellipsis whitespace-nowrap">
            WARNING - This action is irreversible
          </h3>
        </div>
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 transition-all duration-300 bg-transparent rounded-lg text-sm p-1 inline-flex items-center hover:bg-theme-modal-border hover:border-theme-modal-border hover:border-opacity-50 border-transparent border"
        >
          <X size={24} weight="bold" className="text-theme-text-primary" />
        </button>
      </div>
      <div
        className="h-full w-full overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 200px)" }}
      >
        <div className="py-7 px-9 space-y-2 flex-col">
          <p className="text-theme-text-primary">
            {warningText.split("\\n").map((line, index) => (
              <span key={index}>
                {line}
                <br />
              </span>
            ))}
            <br />
            <br />
            Are you sure you want to proceed?
          </p>
        </div>
      </div>
      <div className="flex w-full justify-end items-center p-6 space-x-2 border-t border-theme-modal-border rounded-b">
        <Button onClick={onClose} type="button" variant="muted">
          Cancel
        </Button>
        <Button onClick={onConfirm} type="submit" variant="danger">
          Confirm
        </Button>
      </div>
    </div>
  );
}
