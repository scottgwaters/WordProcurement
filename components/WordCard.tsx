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
  onSkip?: () => void;
  isLoading?: boolean;
}

export default function WordCard({
  word,
  showActions = false,
  onVerify,
  onReject,
  onEdit,
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
                title={assignment.world.tagline}
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
        <div>
          {word.verified ? (
            <span className="badge badge-success">Verified</span>
          ) : (
            <span className="badge badge-warning">Pending</span>
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

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-[var(--border-light)]">
          <button
            onClick={() => onVerify?.(word.id)}
            disabled={isLoading}
            className="btn btn-success flex-1"
          >
            {isLoading ? <span className="spinner" /> : "Approve"}
          </button>
          <button
            onClick={() => onReject?.(word.id)}
            disabled={isLoading}
            className="btn btn-danger flex-1"
          >
            Reject
          </button>
          <button
            onClick={() => onEdit?.(word.id)}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            Edit
          </button>
          <button
            onClick={onSkip}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
