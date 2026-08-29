import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { BrainCircuit, Check, Gauge, Search, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ARCHIVE_SEARCH_EFFORTS,
  type ArchiveModelPreferences,
  type ArchivePersonaProProfile,
  type ArchiveSearchEffort,
  type ArchiveSearchModel,
  archiveEffortName,
  archivePersonaProfileLabel,
  archiveSearchModelName,
  archiveSearchPreferenceLabel,
  normalizeArchiveModelPreferences,
} from "@/lib/archive-model-config";

type ArchiveModelSelectorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ArchiveModelPreferences;
  onApply: (value: ArchiveModelPreferences) => void;
  onReturnFocus: () => void;
};

const SEARCH_MODELS: readonly {
  id: ArchiveSearchModel;
  eyebrow: string;
  description: string;
  note: string;
}[] = [
  {
    id: "gpt-5.6-terra",
    eyebrow: "FRONTIER SEARCH",
    description: "会話の文脈と公開記録を深く照合。長い追跡や曖昧な手掛かり向け。",
    note: "LOW — XHIGH / PRO対応",
  },
  {
    id: "gpt-5.5",
    eyebrow: "BALANCED SEARCH",
    description: "自然な会話と検索精度を両立。軽快さを保ちながら丁寧に絞り込みます。",
    note: "LOW — XHIGH",
  },
];

const PERSONA_PROFILES: readonly {
  id: ArchivePersonaProProfile;
  eyebrow: string;
  title: string;
  description: string;
}[] = [
  {
    id: "instant",
    eyebrow: "RESPONSIVE",
    title: "Instant",
    description: "間を短く、人物らしいテンポで会話。日常の短いやり取りに。",
  },
  {
    id: "max",
    eyebrow: "DEEP REASONING",
    title: "Max",
    description: "最大思考量で設定・感情・過去の会話を丁寧に統合します。",
  },
  {
    id: "pro",
    eyebrow: "HIGHEST QUALITY",
    title: "Pro",
    description: "SolのPro mode。複雑な心情と長い文脈を最優先で扱います。",
  },
];

export function ArchiveModelSelector({
  open,
  onOpenChange,
  value,
  onApply,
  onReturnFocus,
}: ArchiveModelSelectorProps) {
  const [draft, setDraft] = useState(() => normalizeArchiveModelPreferences(value));

  useEffect(() => {
    if (open) setDraft(normalizeArchiveModelPreferences(value));
  }, [open, value]);

  const selectSearchModel = (model: ArchiveSearchModel) => {
    setDraft((current) => ({
      ...current,
      search: { ...current.search, model, execution: "standard" },
    }));
  };

  const selectSearchEffort = (effort: ArchiveSearchEffort) => {
    setDraft((current) => ({
      ...current,
      search: { ...current.search, effort, execution: "standard" },
    }));
  };

  const selectSearchPro = () => {
    setDraft((current) => ({
      ...current,
      search: { model: "gpt-5.6-terra", effort: "xhigh", execution: "pro" },
    }));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="archive-model-overlay" />
        <Dialog.Content
          id="archive-model-selector"
          className="archive-model-dialog"
          aria-describedby="archive-model-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onReturnFocus();
          }}
        >
          <span className="archive-model-dialog-aura is-cyan" aria-hidden="true" />
          <span className="archive-model-dialog-aura is-violet" aria-hidden="true" />

          <header className="archive-model-dialog-header">
            <div className="archive-model-dialog-mark" aria-hidden="true">
              <BrainCircuit size={22} strokeWidth={1.45} />
            </div>
            <div>
              <p>ARCHIVE INTELLIGENCE / MODEL ROUTER</p>
              <Dialog.Title>思考回線を選択</Dialog.Title>
              <Dialog.Description
                id="archive-model-description"
                className="archive-model-dialog-description"
              >
                サーチと人格会話に、それぞれ最適な速度と深さを割り当てます。変更は次の応答から反映されます。
              </Dialog.Description>
            </div>
            <Dialog.Close className="archive-model-dialog-close" aria-label="モデル選択を閉じる">
              <X size={20} strokeWidth={1.5} aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="archive-model-dialog-scroll">
            <section className="archive-model-channel" aria-labelledby="archive-model-search-title">
              <header>
                <span aria-hidden="true">
                  <Search size={18} strokeWidth={1.5} />
                </span>
                <div>
                  <p>SEARCH CHANNEL</p>
                  <h3 id="archive-model-search-title">会話型サーチ</h3>
                </div>
                <b>{archiveSearchPreferenceLabel(draft.search)}</b>
              </header>

              <RadioGroup.Root
                className="archive-model-search-grid"
                aria-label="サーチモデル"
                value={draft.search.execution === "standard" ? draft.search.model : ""}
                onValueChange={(value) => selectSearchModel(value as ArchiveSearchModel)}
              >
                {SEARCH_MODELS.map((model) => {
                  const selected =
                    draft.search.model === model.id && draft.search.execution === "standard";
                  return (
                    <RadioGroup.Item
                      key={model.id}
                      value={model.id}
                      className={selected ? "is-selected" : undefined}
                    >
                      <small>{model.eyebrow}</small>
                      <strong>{archiveSearchModelName(model.id)}</strong>
                      <span>{model.description}</span>
                      <i>{model.note}</i>
                      <em aria-hidden="true">{selected ? <Check size={15} /> : null}</em>
                    </RadioGroup.Item>
                  );
                })}
              </RadioGroup.Root>

              <div className="archive-model-effort">
                <div>
                  <p>REASONING EFFORT</p>
                  <span>高いほど複雑な照合に時間を使います。</span>
                </div>
                <RadioGroup.Root
                  aria-label="サーチ思考量"
                  value={draft.search.execution === "standard" ? draft.search.effort : ""}
                  onValueChange={(value) => selectSearchEffort(value as ArchiveSearchEffort)}
                >
                  {ARCHIVE_SEARCH_EFFORTS.map((effort) => {
                    const selected =
                      draft.search.effort === effort && draft.search.execution === "standard";
                    return (
                      <RadioGroup.Item
                        key={effort}
                        value={effort}
                        className={selected ? "is-selected" : undefined}
                      >
                        {archiveEffortName(effort)}
                      </RadioGroup.Item>
                    );
                  })}
                </RadioGroup.Root>
              </div>

              <button
                type="button"
                className={`archive-model-pro-card${draft.search.execution === "pro" ? " is-selected" : ""}`}
                aria-pressed={draft.search.execution === "pro"}
                onClick={selectSearchPro}
              >
                <span aria-hidden="true">
                  <Sparkles size={20} strokeWidth={1.45} />
                </span>
                <div>
                  <small>ADVANCED CONVERSATION</small>
                  <strong>Search Pro</strong>
                  <p>
                    GPT-5.6 TerraのPro
                    modeで、曖昧な手掛かり、長い会話、候補間の意味的な違いまで深く追跡します。
                  </p>
                </div>
                <b>PRO / XHIGH</b>
                <em aria-hidden="true">
                  {draft.search.execution === "pro" ? <Check size={15} /> : null}
                </em>
              </button>
            </section>

            <section
              className="archive-model-channel"
              aria-labelledby="archive-model-persona-title"
            >
              <header>
                <span aria-hidden="true">
                  <Gauge size={18} strokeWidth={1.5} />
                </span>
                <div>
                  <p>PERSONA PRO CHANNEL</p>
                  <h3 id="archive-model-persona-title">なりきり Pro</h3>
                </div>
                <b>{archivePersonaProfileLabel(draft.personaProProfile)}</b>
              </header>

              <RadioGroup.Root
                className="archive-model-persona-grid"
                aria-label="なりきりProモデル"
                value={draft.personaProProfile}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    personaProProfile: value as ArchivePersonaProProfile,
                  }))
                }
              >
                {PERSONA_PROFILES.map((profile) => {
                  const selected = draft.personaProProfile === profile.id;
                  return (
                    <RadioGroup.Item
                      key={profile.id}
                      value={profile.id}
                      className={selected ? "is-selected" : undefined}
                    >
                      <small>{profile.eyebrow}</small>
                      <strong>{profile.title}</strong>
                      <span>{profile.description}</span>
                      <i>GPT-5.6 SOL</i>
                      <em aria-hidden="true">{selected ? <Check size={15} /> : null}</em>
                    </RadioGroup.Item>
                  );
                })}
              </RadioGroup.Root>
            </section>
          </div>

          <footer className="archive-model-dialog-footer">
            <div>
              <small>ACTIVE ROUTE</small>
              <p>
                <span>{archiveSearchPreferenceLabel(draft.search)}</span>
                <i aria-hidden="true">＋</i>
                <span>{archivePersonaProfileLabel(draft.personaProProfile)}</span>
              </p>
            </div>
            <button type="button" onClick={() => onOpenChange(false)}>
              キャンセル
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => {
                onApply(normalizeArchiveModelPreferences(draft));
                onOpenChange(false);
              }}
            >
              <Check size={16} strokeWidth={1.8} aria-hidden="true" />
              この構成を使う
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
