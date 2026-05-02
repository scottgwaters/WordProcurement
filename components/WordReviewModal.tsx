"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Word } from "@/lib/types";
import WordCard from "@/components/WordCard";
import FlagDialog, { type FlagDialogResult, type FlagReasonKey } from "@/components/FlagDialog";

type Props = {
  word: Word;
  onClose: () => void;
  onWordChange: (updated: Word) => void;
};

export default function WordReviewModal({ word, onClose, onWordChange }: Props) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [flagTargetId, setFlagTargetId] = useState<string | null>(null);
  const [flagInitialReasons, setFlagInitialReasons] = useState<FlagReasonKey[]>([]);
  const [flagInitialNote, setFlagInitialNote] = useState<string>("");
  const [flagInitialLoading, setFlagInitialLoading] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !flagTargetId) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, flagTargetId]);

  const handleVerify = async (id: string) => {
    setActing(true);
    const r = await fetch(`/api/words/${id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: true }),
    });
    if (r.ok) {
      onWordChange({ ...word, verified: true, declined: false });
    }
    setActing(false);
  };

  const handleReject = async (id: string) => {
    setActing(true);
    await fetch(`/api/words/${id}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declined: true }),
    });
    onWordChange({ ...word, declined: true, verified: false });
    setActing(false);
  };

  const handleEdit = (id: string) => {
    onClose();
    router.push(`/words/${id}`);
  };

  const handleFlag = async (id: string) => {
    setFlagInitialReasons([]);
    setFlagInitialNote("");
    setFlagTargetId(id);
    if (word.flagged) {
      setFlagInitialLoading(true);
      try {
        const r = await fetch(`/api/words/${id}/flag`);
        if (r.ok) {
          const data = await r.json();
          if (data?.flagged) {
            setFlagInitialReasons(
              (data.reasons ?? []).filter(
                (x: unknown): x is FlagReasonKey =>
                  x === "image" || x === "word_details",
              ),
            );
            setFlagInitialNote(typeof data.note === "string" ? data.note : "");
          }
        }
      } finally {
        setFlagInitialLoading(false);
      }
    }
  };

  const submitFlag = async (result: FlagDialogResult) => {
    const id = flagTargetId;
    if (!id) return;
    setFlagTargetId(null);
    setActing(true);
    await fetch(`/api/words/${id}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flagged: true,
        reasons: result.reasons,
        note: result.note || undefined,
      }),
    });
    onWordChange({ ...word, flagged: true });
    setActing(false);
  };

  const unflagFromDialog = async () => {
    const id = flagTargetId;
    if (!id) return;
    setFlagTargetId(null);
    setActing(true);
    await fetch(`/api/words/${id}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged: false }),
    });
    onWordChange({ ...word, flagged: false });
    setActing(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center px-4 py-8 bg-black/40 overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Review ${word.word}`}
          className="relative w-full max-w-4xl bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-xl"
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-fast"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <WordCard
            word={word}
            showActions
            onVerify={handleVerify}
            onReject={handleReject}
            onEdit={handleEdit}
            onFlag={handleFlag}
            onSkip={onClose}
            isLoading={acting}
          />
        </div>
      </div>
      {flagTargetId && (
        <FlagDialog
          word={word.word}
          alreadyFlagged={word.flagged ?? false}
          loadingExisting={flagInitialLoading}
          initialReasons={flagInitialReasons}
          initialNote={flagInitialNote}
          onSubmit={submitFlag}
          onUnflag={unflagFromDialog}
          onCancel={() => setFlagTargetId(null)}
        />
      )}
    </>
  );
}
