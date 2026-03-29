import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  titleId?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Above room moderation overlay (z-50) */
  zClassName?: string;
  /** When false, hides the header “Close” control (footer / overlay still dismiss). */
  showCloseButton?: boolean;
};

export function Modal({
  open,
  title,
  titleId = "modal-title",
  onClose,
  children,
  footer,
  zClassName = "z-[100]",
  showCloseButton = true,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/65 p-4 ${zClassName}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={`mb-3 flex items-center gap-2 ${showCloseButton ? "justify-between" : ""}`}
        >
          <h2 id={titleId} className="text-lg font-semibold text-white">
            {title}
          </h2>
          {showCloseButton ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
            >
              Close
            </button>
          ) : null}
        </div>
        {children}
        {footer ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
