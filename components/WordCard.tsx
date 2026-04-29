"use client";

import type { Word } from "@/lib/types";
import { worldForCategory } from "@/lib/worlds";
import GradeBadge from "@/components/GradeBadge";
import ImageLightbox from "@/components/ImageLightbox";
import Link from "next/link";
import { useState } from "react";

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
  // Image generation lags behind word creation — when the asset doesn't exist
  // yet, the API returns 302 → R2 404. Hide the slot rather than showing a
  // broken-image icon next to the word.
  const [imageFailed, setImageFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const imageSrc = `/api/words/${word.id}/image`;
  return (
    <div className="card p-6 transition-normal">
      {/* Header: word + chips + status — visually sealed with a bottom divider */}
      <div className="review-card-header">
        {!imageFailed && (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`View larger illustration for ${word.word}`}
            className="review-card-image-button"
          >
            <img
              src={imageSrc}
              alt={`Illustration for ${word.word}`}
              className="review-card-image"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          </button>
        )}
        {lightboxOpen && !imageFailed && (
          <ImageLightbox
            src={imageSrc}
            alt={`Illustration for ${word.word}`}
            onClose={() => setLightboxOpen(false)}
          />
        )}
        <div className="review-card-header__main">
          <Link
            href={`/words/${word.id}`}
            className="word-display word-display--xl hover:text-[var(--accent)] transition-fast"
          >
            {word.word}
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Audience — distinct color per grade */}
            <GradeBadge value={word.grade_level} />
            {/* Difficulty — neutral grey so grade is the only ordinal using color */}
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
          {word.declined ? (
            <span
              className="badge badge-error"
              title="You declined this — clicking Approve will restore it"
            >
              Declined
            </span>
          ) : word.verified ? (
            <span className="badge badge-success">Verified</span>
          ) : (
            <span className="badge badge-warning">Pending</span>
          )}
        </div>
      </div>

      {/* 1. Definition — the anchor / source of truth */}
      {(word.definition || word.example_sentence) && (
        <section className="review-def">
          <div className="review-section-label">Definition</div>
          {word.definition && (
            <div className="review-def__body">{word.definition}</div>
          )}
          {word.example_sentence && (
            <div className="review-def__example">
              &ldquo;{word.example_sentence}&rdquo;
            </div>
          )}
        </section>
      )}

      {/* Pronunciation — kid-display respelling is the headline; IPA + ARPAbet
          are the fine-print so reviewers can audit. Hidden when nothing's set. */}
      {(word.pronunciation_respelling || word.pronunciation || word.pronunciation_arpabet) && (
        <section className="review-def">
          <div className="review-section-label">Pronunciation</div>
          {word.pronunciation_respelling && (
            <div className="review-def__body">
              {word.pronunciation_respelling}
              <span className="text-xs text-[var(--text-secondary)] font-normal ml-2">
                · shown in-game
              </span>
            </div>
          )}
          {(word.pronunciation || word.pronunciation_arpabet) && (
            <div className="text-xs text-[var(--text-secondary)] mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {word.pronunciation && (
                <span>IPA: <span className="font-mono">{word.pronunciation}</span></span>
              )}
              {word.pronunciation_arpabet && (
                <span>ARPAbet: <span className="font-mono">{word.pronunciation_arpabet}</span></span>
              )}
            </div>
          )}
        </section>
      )}

      {/* 2. Hints — bounded module with title bar and ordered rows */}
      {word.hints && (
        <section className="review-hints">
          <header className="review-hints__titlebar">
            <span className="review-hints__title">Hints</span>
          </header>
          <ol className="review-hints__list">
            <li className="review-hints__row" data-tier="easy">
              <span className="review-hints__num">1</span>
              <span className="review-hints__pill">Easy</span>
              <span className="review-hints__text">{word.hints.easy}</span>
            </li>
            <li className="review-hints__row" data-tier="medium">
              <span className="review-hints__num">2</span>
              <span className="review-hints__pill">Medium</span>
              <span className="review-hints__text">{word.hints.medium}</span>
            </li>
            <li className="review-hints__row" data-tier="hard">
              <span className="review-hints__num">3</span>
              <span className="review-hints__pill">Hard</span>
              <span className="review-hints__text">{word.hints.hard}</span>
            </li>
          </ol>
        </section>
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
              className={`btn inline-flex items-center gap-2 ${
                word.flagged
                  ? "btn-flag-active"
                  : "btn-secondary"
              }`}
              aria-label={
                word.flagged
                  ? "Currently flagged — click to un-flag"
                  : "Flag this word for another reviewer"
              }
              aria-pressed={word.flagged ? true : false}
              title={
                word.flagged
                  ? "Currently flagged — click to un-flag"
                  : "Flag for another reviewer to look at"
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={word.flagged ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              {word.flagged ? "Flagged" : "Flag"}
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
