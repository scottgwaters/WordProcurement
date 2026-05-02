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
  /** True when the word is already flagged — switches the dialog to "edit"
   *  mode (different title + button labels) and enables the Remove button. */
  alreadyFlagged?: boolean;
  /** Shown in edit mode while we're loading the previously saved reasons/note
   *  from the server, so the form doesn't briefly look empty. */
  loadingExisting?: boolean;
  onSubmit: (result: FlagDialogResult) => void;
  onUnflag?: () => void;
  onCancel: () => void;
};

export default function FlagDialog({
  word,
  initialReasons = [],
  initialNote = "",
  alreadyFlagged = false,
  loadingExisting = false,
  onSubmit,
  onUnflag,
  onCancel,
}: Props) {
  const [reasons, setReasons] = useState<Set<FlagReasonKey>>(
    () => new Set(initialReasons),
  );
  const [note, setNote] = useState(initialNote);
  const submitRef = useRef<HTMLButtonElement>(null);
  const canSubmit = reasons.size > 0 || note.trim().length > 0;

  // When existing flag details arrive after the dialog mounts (async fetch),
  // hydrate the form. We only sync from props on initial value change so a
  // user edit isn't clobbered by a late response.
  useEffect(() => {
    setReasons(new Set(initialReasons));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReasons.join("|")]);
  useEffect(() => {
    setNote(initialNote);
  }, [initialNote]);

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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4 bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-dialog-title"
        className="flag-dialog w-full max-w-md rounded-t-2xl sm:rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] shadow-xl overflow-hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0)",
        }}
      >
        <div className="p-6">
          <h2
            id="flag-dialog-title"
            className="text-lg font-semibold text-[var(--text-primary)] mb-1"
          >
            {alreadyFlagged ? "Edit flag on " : "Flag "}
            <span className="font-mono">{word}</span>
            {alreadyFlagged ? "" : " for review"}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            {alreadyFlagged
              ? loadingExisting
                ? "Loading what was previously flagged…"
                : "Already flagged. Update the reasons or note, or remove the flag."
              : "What’s off? Pick one or both, add a note if useful."}
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

        <div className="flex justify-between gap-2 px-6 py-3 bg-[var(--bg-secondary)] border-t border-[var(--border-light)]">
          <div>
            {alreadyFlagged && onUnflag && (
              <button
                type="button"
                onClick={onUnflag}
                className="btn btn-secondary"
                title="Remove the flag from this word"
              >
                Remove flag
              </button>
            )}
          </div>
          <div className="flex gap-2">
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
              {alreadyFlagged ? "Save changes" : "Flag word"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
