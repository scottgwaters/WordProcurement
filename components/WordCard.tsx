"use client";

import type { Word } from "@/lib/types";
import { worldForCategory } from "@/lib/worlds";
import Link from "next/link";

interface WordCardProps {
  word: Word;
  showActions?: boolean;
  onVerify?: (wordId: string) => void;
  onReject?: (wordId: string) => void;
  onEdit?: (wordId: string) => void;
  onFlag?: (wordId: string) => void;
  onSkip?: () => void;
  isLoading?: boolean;
}

export default function WordCard({
  word,
  showActions = false,
  onVerify,
  onReject,
  onEdit,
  onFlag,
  onSkip,
  isLoading = false,
}: WordCardProps) {
  const assignment = worldForCategory(word.category);
  return (
    <div className="card p-6 transition-normal">
      {/* Word header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <Link
            href={`/words/${word.id}`}
            className="word-display hover:text-[var(--accent)] transition-fast"
          >
            {word.word}
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Classification — neutral */}
            <span className="badge badge-meta-category">{word.category.replace(/_/g, " ")}</span>
            {/* Audience — cool tint */}
            <span className="badge badge-meta-age">Ages {word.age_group}</span>
            {/* Difficulty — warm tint */}
            <span className="badge badge-meta-level">Level {word.level}</span>
            {/* Destination — accent tint */}
            {assignment.world ? (
              <span
                className="badge badge-meta-world"
                title={`${assignment.world.tagline}\n\n${assignment.world.description}`}
              >
                {assignment.world.emoji} {assignment.world.name}
              </span>
            ) : (
              <span
                className="badge badge-warning"
                title={assignment.note}
              >
                ⚠ World: Mixed
              </span>
            )}
          </div>
          {assignment.ambiguous && (
            <p className="text-xs text-[var(--text-secondary)] mt-2 max-w-xl">
              {assignment.note}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {word.verified ? (
            <span className="badge badge-success">Verified</span>
          ) : (
            <span className="badge badge-warning">Pending</span>
          )}
          {word.flagged && (
            <span
              className="badge badge-warning"
              title="Flagged for another reviewer"
            >
              ⚑ Flagged
            </span>
          )}
        </div>
      </div>

      {/* Hints */}
      {word.hints && (
        <div className="space-y-2 mb-4">
          <div className="text-sm">
            <span className="font-medium text-[var(--text-secondary)]">Easy: </span>
            <span className="text-[var(--text-primary)]">{word.hints.easy}</span>
          </div>
          <div className="text-sm">
            <span className="font-medium text-[var(--text-secondary)]">Medium: </span>
            <span className="text-[var(--text-primary)]">{word.hints.medium}</span>
          </div>
          <div className="text-sm">
            <span className="font-medium text-[var(--text-secondary)]">Hard: </span>
            <span className="text-[var(--text-primary)]">{word.hints.hard}</span>
          </div>
        </div>
      )}

      {/* Educational metadata */}
      {(word.definition || word.example_sentence) && (
        <div className="border-t border-[var(--border-light)] pt-6 mt-8 space-y-3">
          {word.definition && (
            <div className="text-sm">
              <span className="font-medium text-[var(--text-secondary)]">Definition: </span>
              <span className="text-[var(--text-primary)]">{word.definition}</span>
            </div>
          )}
          {word.example_sentence && (
            <div className="text-sm">
              <span className="font-medium text-[var(--text-secondary)]">Example: </span>
              <span className="text-[var(--text-primary)] italic">
                &ldquo;{word.example_sentence}&rdquo;
              </span>
            </div>
          )}
        </div>
      )}

      {/* Actions — progressive commitment: low-weight left, irreversible right */}
      {showActions && (
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-[var(--border-light)]">
          <button
            onClick={onSkip}
            disabled={isLoading}
            className="btn btn-ghost"
            aria-label="Skip this word"
          >
            Skip
          </button>
          <button
            onClick={() => onEdit?.(word.id)}
            disabled={isLoading}
            className="btn btn-secondary inline-flex items-center gap-2"
            aria-label="Edit this word"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
          {onFlag && (
            <button
              onClick={() => onFlag(word.id)}
              disabled={isLoading}
              className="btn btn-secondary inline-flex items-center gap-2"
              aria-label="Flag this word for another reviewer"
              title="Flag for another reviewer to look at"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              Flag
            </button>
          )}
          <div className="flex-1" aria-hidden />
          <button
            onClick={() => onReject?.(word.id)}
            disabled={isLoading}
            className="btn btn-outline-danger"
          >
            Decline
          </button>
          <button
            onClick={() => onVerify?.(word.id)}
            disabled={isLoading}
            className="btn btn-approve"
          >
            {isLoading ? <span className="spinner" /> : "Approve"}
          </button>
        </div>
      )}
    </div>
  );
}
