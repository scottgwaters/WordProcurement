"use client";

import { useEffect, useRef, useState } from "react";

// Speaker button next to the word headline. Streams /api/words/<id>/audio
// (302 → R2 presign) on click. Mirrors HintPlayButton's behavior so the two
// audio affordances feel identical to the reviewer.
export default function WordPlayButton({ wordId }: { wordId: string }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [state, setState] = useState<"idle" | "playing" | "missing">("idle");

    useEffect(() => {
        setState("idle");
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    }, [wordId]);

    function toggle(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (state === "missing") return;

        if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
            setState("idle");
            return;
        }

        const audio = audioRef.current ?? new Audio(`/api/words/${wordId}/audio`);
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
            ? "Word audio not available"
            : state === "playing"
                ? "Stop"
                : "Play word";

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={state === "missing"}
            aria-label={label}
            title={label}
            className="word-play"
        >
            {state === "playing" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                </svg>
            ) : state === "missing" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" opacity="0.4" />
                    <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
            ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
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
