import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, FileSearch, MessageSquarePlus, SlidersHorizontal } from "lucide-react";
import { useRef, type PointerEvent, type RefObject } from "react";

type ComposerModelOption = {
  id: string;
  label: string;
  detail: string;
  active: boolean;
  onSelect: () => void;
};

type ArchiveComposerModelMenuProps = {
  label: string;
  eyebrow: string;
  options: readonly ComposerModelOption[];
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onOpenDetailed: () => void;
};

type ArchiveComposerToolsProps = {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onNewConversation: () => void;
  onAttachArchive: () => void;
  onOpenDetailed?: () => void;
};

type SelectionSnapshot = { start: number; end: number } | null;

function useStableEditorSelection(editorRef: RefObject<HTMLTextAreaElement | null>) {
  const selectionRef = useRef<SelectionSnapshot>(null);

  const preserve = (event?: PointerEvent<HTMLElement>) => {
    const editor = editorRef.current;
    if (editor && document.activeElement === editor) {
      selectionRef.current = {
        start: editor.selectionStart ?? editor.value.length,
        end: editor.selectionEnd ?? editor.value.length,
      };
    }
    event?.preventDefault();
  };

  const restore = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = selectionRef.current;
    window.requestAnimationFrame(() => {
      editor.focus({ preventScroll: true });
      if (selection) editor.setSelectionRange(selection.start, selection.end);
    });
  };

  return { preserve, restore };
}

export function ArchiveComposerModelBadge({
  label = "Grok 4.20",
}: {
  label?: string;
}) {
  return (
    <div className="archive-composer-model-trigger is-static" aria-label={`使用モデル ${label}`}>
      <span aria-hidden="true" />
      <b>{label}</b>
    </div>
  );
}

export function ArchiveComposerModelMenu({
  label,
  eyebrow,
  options,
  editorRef,
  onOpenDetailed,
}: ArchiveComposerModelMenuProps) {
  const { preserve, restore } = useStableEditorSelection(editorRef);
  const skipRestoreRef = useRef(false);

  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        className="archive-composer-model-trigger"
        onPointerDown={preserve}
        aria-label={`使用モデルを変更。現在は${label}`}
      >
        <span aria-hidden="true" />
        <b>{label}</b>
        <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="archive-composer-popover archive-composer-model-popover"
          side="top"
          align="start"
          sideOffset={9}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!skipRestoreRef.current) restore();
            skipRestoreRef.current = false;
          }}
        >
          <header>
            <small>{eyebrow}</small>
            <p>次の応答に使うモデル</p>
          </header>
          <div className="archive-composer-model-options" role="radiogroup" aria-label="モデル">
            {options.map((option) => (
              <Popover.Close key={option.id} asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={option.active}
                  className={option.active ? "is-active" : undefined}
                  onPointerDown={preserve}
                  onClick={() => {
                    option.onSelect();
                    restore();
                  }}
                >
                  <span>
                    <b>{option.label}</b>
                    <small>{option.detail}</small>
                  </span>
                  {option.active ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : null}
                </button>
              </Popover.Close>
            ))}
          </div>
          <Popover.Close asChild>
            <button
              type="button"
              className="archive-composer-model-details"
              onPointerDown={preserve}
              onClick={() => {
                skipRestoreRef.current = true;
                onOpenDetailed();
              }}
            >
              <SlidersHorizontal size={15} strokeWidth={1.7} aria-hidden="true" />
              すべてのモデル設定
            </button>
          </Popover.Close>
          <Popover.Arrow className="archive-composer-popover-arrow" aria-hidden="true" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ArchiveComposerTools({
  editorRef,
  onNewConversation,
  onAttachArchive,
  onOpenDetailed,
}: ArchiveComposerToolsProps) {
  const { preserve, restore } = useStableEditorSelection(editorRef);
  const skipRestoreRef = useRef(false);

  const action = (callback: () => void, shouldRestore = true) => {
    callback();
    if (shouldRestore) restore();
  };

  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        className="archive-composer-leading archive-composer-plus"
        aria-label="会話ツールを開く"
        tabIndex={-1}
        onPointerDown={preserve}
      >
        <span aria-hidden="true">＋</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="archive-composer-popover archive-composer-tools-popover"
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!skipRestoreRef.current) restore();
            skipRestoreRef.current = false;
          }}
        >
          <small>CONVERSATION TOOLS</small>
          <Popover.Close asChild>
            <button
              type="button"
              onPointerDown={preserve}
              onClick={() => {
                skipRestoreRef.current = true;
                action(onAttachArchive, false);
              }}
            >
              <FileSearch size={16} strokeWidth={1.7} aria-hidden="true" />
              <span>
                <b>公開記録を添付</b>
                <small>サイト内資料を回答へ含める</small>
              </span>
            </button>
          </Popover.Close>
          <Popover.Close asChild>
            <button
              type="button"
              onPointerDown={preserve}
              onClick={() => action(onNewConversation)}
            >
              <MessageSquarePlus size={16} strokeWidth={1.7} aria-hidden="true" />
              <span>
                <b>新しい会話</b>
                <small>現在の会話を初期化</small>
              </span>
            </button>
          </Popover.Close>
          {onOpenDetailed ? (
          <Popover.Close asChild>
            <button
              type="button"
              onPointerDown={preserve}
              onClick={() => {
                skipRestoreRef.current = true;
                action(onOpenDetailed, false);
              }}
            >
              <SlidersHorizontal size={16} strokeWidth={1.7} aria-hidden="true" />
              <span>
                <b>モデル詳細</b>
                <small>速度と思考量を調整</small>
              </span>
            </button>
          </Popover.Close>
          ) : null}
          <Popover.Arrow className="archive-composer-popover-arrow" aria-hidden="true" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
