"use client";

import { useEffect, useRef, useState } from "react";

// Small play button that streams a hint clip from
// /api/words/<id>/hints/<tier> on demand. The endpoint 302s to a fresh
// presigned URL; on 404 (no clip uploaded yet for this word/tier) the
// button silently disables itself after the first failed play attempt.
//
// Lives next to each hint row so reviewers can audition exactly what kids
// will hear in-game.
export default function HintPlayButton({
    wordId,
    tier,
}: {
    wordId: string;
    tier: "easy" | "medium" | "hard";
}) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [state, setState] = useState<"idle" | "playing" | "missing">("idle");

    useEffect(() => {
        // Reset when the row's word/tier changes (the card swaps words on next).
        setState("idle");
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    }, [wordId, tier]);

    function toggle(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (state === "missing") return;

        if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
            setState("idle");
            return;
        }

        const audio = audioRef.current ?? new Audio(`/api/words/${wordId}/hints/${tier}`);
        audioRef.current = audio;
        audio.onended = () => setState("idle");
        audio.onerror = () => setState("missing");
        audio
            .play()
            .then(() => setState("playing"))
            .catch(() => setState("missing"));
    }

    const label =
        state === "missing"
            ? "Hint audio not uploaded yet"
            : state === "playing"
                ? "Stop hint"
                : "Play hint";

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={state === "missing"}
            aria-label={label}
            title={label}
            className="review-hints__play"
        >
            {state === "playing" ? (
                // Pause / stop glyph
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                </svg>
            ) : state === "missing" ? (
                // Muted speaker
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" opacity="0.4" />
                    <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
            ) : (
                // Speaker with play indicator
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
                    <path
                        d="M16 8a5 5 0 0 1 0 8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                    />
                </svg>
            )}
        </button>
    );
}
