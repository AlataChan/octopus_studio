/**
 * Shared full-screen scrim. Strictly bound to `open` — unmounts when closed
 * so it can never get stuck dimming the UI. Lives at the --z-overlay tier.
 */
export default function Backdrop({ open, onClose, className = "", children = null }) {
  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-overlay bg-black/60 backdrop-blur-sm ${className}`}
      onClick={onClose}
    >
      {children}
    </div>
  );
}
