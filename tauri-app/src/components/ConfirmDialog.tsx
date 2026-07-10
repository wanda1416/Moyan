interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** 左侧按钮（次要操作，如"取消"） */
  cancelText?: string;
  /** 中间按钮（保存/应用） */
  confirmText?: string;
  /** 右侧按钮（丢弃修改） */
  destructiveText?: string;
  onCancel: () => void;
  onConfirm?: () => void;
  onDestructive?: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  cancelText = "取消",
  confirmText = "保存",
  destructiveText = "放弃修改",
  onCancel,
  onConfirm,
  onDestructive,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header">
          <h3>{title}</h3>
        </div>
        <div className="confirm-dialog-body">
          <p>{message}</p>
        </div>
        <div className="confirm-dialog-actions">
          {onDestructive && (
            <button className="btn-destructive" onClick={onDestructive}>
              {destructiveText}
            </button>
          )}
          <button className="btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          {onConfirm && (
            <button className="btn-primary" onClick={onConfirm}>
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
