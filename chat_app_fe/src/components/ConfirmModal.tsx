import { Modal } from "./Modal";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  zClassName?: string;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  busy,
  onConfirm,
  onClose,
  zClassName,
}: Props) {
  return (
    <Modal
      open={open}
      title={title}
      titleId="confirm-modal-title"
      onClose={busy ? () => {} : onClose}
      zClassName={zClassName}
      showCloseButton={false}
      footer={
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              destructive
                ? "bg-red-600 hover:bg-red-500"
                : "bg-violet-600 hover:bg-violet-500"
            }`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-300">{message}</p>
    </Modal>
  );
}
