"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Promise-based dialog API — a drop-in replacement for window.confirm /
// window.alert / window.prompt that renders a styled modal instead of the
// browser's native dialog. Call via useDialog().
//
//   const dlg = useDialog();
//   if (!(await dlg.confirm({ title: "Delete user?", destructive: true }))) return;
//
// Only one dialog is visible at a time; calling another while one is open
// queues the new one until the current resolves. Keeps the implementation
// simple and prevents modal stacking.

type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type AlertOpts = {
  title: string;
  message?: string;
  okLabel?: string;
  tone?: "info" | "error";
};

type PromptOpts = {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  multiline?: boolean;
  okLabel?: string;
  cancelLabel?: string;
  /** Return null from validate() to indicate "valid"; return an error string
   *  to keep the dialog open and display it. */
  validate?: (value: string) => string | null;
};

type DialogState =
  | { kind: "idle" }
  | {
      kind: "confirm";
      opts: ConfirmOpts;
      resolve: (value: boolean) => void;
    }
  | {
      kind: "alert";
      opts: AlertOpts;
      resolve: () => void;
    }
  | {
      kind: "prompt";
      opts: PromptOpts;
      resolve: (value: string | null) => void;
    };

type DialogContextValue = {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  alert: (opts: AlertOpts) => Promise<void>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used inside <DialogProvider>");
  }
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>({ kind: "idle" });
  // Queue so a second call while one is open doesn't lose the promise.
  const queueRef = useRef<Array<() => void>>([]);

  const openOrQueue = useCallback((openFn: () => void) => {
    if (state.kind === "idle") {
      openFn();
    } else {
      queueRef.current.push(openFn);
    }
  }, [state.kind]);

  const close = useCallback((next: DialogState = { kind: "idle" }) => {
    setState(next);
    if (next.kind === "idle" && queueRef.current.length > 0) {
      const fn = queueRef.current.shift();
      fn?.();
    }
  }, []);

  const api = useMemo<DialogContextValue>(
    () => ({
      confirm: (opts) =>
        new Promise<boolean>((resolve) => {
          openOrQueue(() => setState({ kind: "confirm", opts, resolve }));
        }),
      alert: (opts) =>
        new Promise<void>((resolve) => {
          openOrQueue(() => setState({ kind: "alert", opts, resolve }));
        }),
      prompt: (opts) =>
        new Promise<string | null>((resolve) => {
          openOrQueue(() => setState({ kind: "prompt", opts, resolve }));
        }),
    }),
    [openOrQueue]
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {state.kind !== "idle" && (
        <DialogUI state={state} onClose={close} />
      )}
    </DialogContext.Provider>
  );
}

function DialogUI({
  state,
  onClose,
}: {
  state: Exclude<DialogState, { kind: "idle" }>;
  onClose: (next?: DialogState) => void;
}) {
  const [promptValue, setPromptValue] = useState(
    state.kind === "prompt" ? state.opts.initialValue ?? "" : ""
  );
  const [promptError, setPromptError] = useState<string | null>(null);

  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus management: remember what had focus, move it into the dialog on
  // open, restore it on close. Without this, keyboard users lose their place.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const toFocus = state.kind === "prompt" ? inputRef.current : confirmButtonRef.current;
    toFocus?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [state.kind]);

  const resolveAndClose = useCallback(() => {
    if (state.kind === "confirm") {
      state.resolve(true);
    } else if (state.kind === "prompt") {
      // Run validation before committing. An error string keeps the dialog open.
      if (state.opts.validate) {
        const err = state.opts.validate(promptValue);
        if (err) {
          setPromptError(err);
          return;
        }
      }
      state.resolve(promptValue);
    } else {
      state.resolve();
    }
    onClose();
  }, [state, promptValue, onClose]);

  const cancel = useCallback(() => {
    if (state.kind === "confirm") state.resolve(false);
    else if (state.kind === "prompt") state.resolve(null);
    else state.resolve();
    onClose();
  }, [state, onClose]);

  // Keyboard shortcuts — Esc cancels, Enter confirms (except in multiline
  // prompts where Enter should add a newline).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && !e.shiftKey) {
        const isMultilinePrompt =
          state.kind === "prompt" && state.opts.multiline === true;
        if (!isMultilinePrompt) {
          e.preventDefault();
          resolveAndClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, resolveAndClose, cancel]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    // Don't let a misclick confirm a destructive action.
    if (state.kind === "confirm" && state.opts.destructive) return;
    cancel();
  };

  const role = state.kind === "alert" || state.kind === "confirm" ? "alertdialog" : "dialog";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] shadow-xl overflow-hidden"
      >
        <div className="p-6">
          <h2
            id="dialog-title"
            className="text-lg font-semibold text-[var(--text-primary)] mb-2"
          >
            {state.opts.title}
          </h2>

          {state.kind !== "prompt" && "message" in state.opts && state.opts.message && (
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
              {state.opts.message}
            </p>
          )}

          {state.kind === "prompt" && (
            <>
              {state.opts.message && (
                <p className="text-sm text-[var(--text-secondary)] mb-3 whitespace-pre-wrap leading-relaxed">
                  {state.opts.message}
                </p>
              )}
              {state.opts.multiline ? (
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  value={promptValue}
                  onChange={(e) => {
                    setPromptValue(e.target.value);
                    if (promptError) setPromptError(null);
                  }}
                  placeholder={state.opts.placeholder}
                  rows={4}
                  className="input w-full"
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={promptValue}
                  onChange={(e) => {
                    setPromptValue(e.target.value);
                    if (promptError) setPromptError(null);
                  }}
                  placeholder={state.opts.placeholder}
                  className="input w-full"
                />
              )}
              {promptError && (
                <p className="text-xs text-[var(--error)] mt-2">{promptError}</p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-3 bg-[var(--bg-secondary)] border-t border-[var(--border-light)]">
          {state.kind !== "alert" && (
            <button
              type="button"
              onClick={cancel}
              className="btn btn-secondary"
            >
              {state.kind === "confirm"
                ? state.opts.cancelLabel ?? "Cancel"
                : state.opts.cancelLabel ?? "Cancel"}
            </button>
          )}
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={resolveAndClose}
            className={
              state.kind === "confirm" && state.opts.destructive
                ? "btn btn-outline-danger"
                : "btn btn-primary"
            }
          >
            {state.kind === "confirm"
              ? state.opts.confirmLabel ?? "Confirm"
              : state.kind === "alert"
                ? state.opts.okLabel ?? "OK"
                : state.opts.okLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
