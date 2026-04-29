"use client";

import { useEffect, useRef, useState } from "react";

export type FlagReasonKey = "image" | "word_details";

export type FlagDialogResult = {
  reasons: FlagReasonKey[];
  note: string;
};

const CATEGORIES: { key: FlagReasonKey; label: string; hint: string }[] = [
  { key: "image", label: "Picture", hint: "Wrong, scary, or off for the word" },
  {
    key: "word_details",
    label: "Word details",
    hint: "Definition, hints, sentence, grade level, world…",
  },
];

export const FLAG_REASON_LABELS: Record<FlagReasonKey, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
) as Record<FlagReasonKey, string>;

type Props = {
  word: string;
  initialReasons?: FlagReasonKey[];
  initialNote?: string;
  onSubmit: (result: FlagDialogResult) => void;
  onCancel: () => void;
};

export default function FlagDialog({
  word,
  initialReasons = [],
  initialNote = "",
  onSubmit,
  onCancel,
}: Props) {
  const [reasons, setReasons] = useState<Set<FlagReasonKey>>(
    () => new Set(initialReasons),
  );
  const [note, setNote] = useState(initialNote);
  const submitRef = useRef<HTMLButtonElement>(null);
  const canSubmit = reasons.size > 0 || note.trim().length > 0;

  useEffect(() => {
    submitRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const toggle = (key: FlagReasonKey) =>
    setReasons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ reasons: Array.from(reasons), note: note.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-dialog-title"
        className="w-full max-w-md rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] shadow-xl overflow-hidden"
      >
        <div className="p-6">
          <h2
            id="flag-dialog-title"
            className="text-lg font-semibold text-[var(--text-primary)] mb-1"
          >
            Flag <span className="font-mono">{word}</span> for review
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            What&rsquo;s off? Pick one or both, add a note if useful.
          </p>

          <fieldset className="mb-4 space-y-2">
            <legend className="sr-only">What&rsquo;s wrong?</legend>
            {CATEGORIES.map((c) => {
              const checked = reasons.has(c.key);
              return (
                <label
                  key={c.key}
                  className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-fast ${
                    checked
                      ? "bg-[var(--warning-bg)] border-[var(--warning)]"
                      : "bg-[var(--bg-primary)] border-[var(--border-light)] hover:border-[var(--border)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.key)}
                    className="mt-1"
                  />
                  <span className="text-sm leading-tight">
                    <span className="font-medium text-[var(--text-primary)]">
                      {c.label}
                    </span>
                    <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                      {c.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything specific to point out?"
              rows={3}
              className="input w-full mt-1"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-6 py-3 bg-[var(--bg-secondary)] border-t border-[var(--border-light)]">
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button
            ref={submitRef}
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn btn-primary"
            title={
              canSubmit ? undefined : "Pick at least one reason or write a note"
            }
          >
            Flag word
          </button>
        </div>
      </div>
    </div>
  );
}
