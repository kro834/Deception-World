import { Pencil, RotateCcw, X } from "lucide-react";

export function ArchiveMessageActions({
  onEdit,
  onResend,
  onClose,
}: {
  onEdit: () => void;
  onResend: () => void;
  onClose: () => void;
}) {
  return (
    <div className="archive-message-actions" aria-label="送信済みメッセージの操作">
      <button type="button" onClick={onEdit}>
        <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
        編集
      </button>
      <button type="button" onClick={onResend}>
        <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
        再送信
      </button>
      <button type="button" onClick={onClose} aria-label="メッセージ操作を閉じる">
        <X size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ArchiveComposerEditNotice({
  overLimit,
  onCancel,
}: {
  overLimit: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="archive-composer-edit-notice" role="status">
      <span>
        <Pencil size={13} strokeWidth={1.8} aria-hidden="true" />
        {overLimit
          ? "現在のモードの文字数上限を超えています"
          : "このメッセージ以降を分岐して再送信します"}
      </span>
      <button type="button" onClick={onCancel}>
        キャンセル
      </button>
    </div>
  );
}
