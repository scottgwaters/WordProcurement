"use client";

import { useState } from "react";

// Word-level audio review panel. Mirrors the role ImageGeneratePanel plays
// for visuals: streams the per-word .wav from R2 (via the public presign
// redirect at /api/words/[id]/audio) and exposes a one-click toggle for
// the independent `audio_verified` gate.
//
// Audio is decoupled from text verification by design — see the Word.audioVerified
// schema comment for why. Closing/saving the parent form does not flip this
// gate; only the button below does.
interface AudioPanelProps {
    wordId: string;
    audioVerified: boolean;
    audioVerifiedAt: string | null;
    onChange: (next: { audio_verified: boolean; audio_verified_at: string | null; audio_verified_by: string | null }) => void;
    /** Read-only mode (e.g. when another reviewer holds the soft-lock). */
    locked?: boolean;
}

export default function AudioPanel({
    wordId,
    audioVerified,
    audioVerifiedAt,
    onChange,
    locked = false,
}: AudioPanelProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function toggle() {
        if (busy || locked) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/words/${wordId}/audio/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ audioVerified: !audioVerified }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Verify failed (${res.status})`);
            }
            const data = await res.json();
            onChange({
                audio_verified: data.audio_verified,
                audio_verified_at: data.audio_verified_at,
                audio_verified_by: data.audio_verified_by,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="card p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <h2 className="text-lg font-semibold">Audio</h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Listen to the word as kids will hear it in the game. Approve when the
                        pronunciation sounds right; flag mispronunciations as a separate
                        follow-up if needed.
                    </p>
                </div>
                <span
                    className={audioVerified ? "badge badge-success" : "badge badge-warning"}
                    title={audioVerifiedAt ? `Approved ${new Date(audioVerifiedAt).toLocaleString()}` : "Not yet approved"}
                >
                    {audioVerified ? "Audio Verified" : "Audio Pending"}
                </span>
            </div>

            <audio
                controls
                preload="none"
                src={`/api/words/${wordId}/audio`}
                className="w-full mb-3"
            />

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={toggle}
                    disabled={busy || locked}
                    title={locked ? "Another reviewer is editing this word" : undefined}
                    className={audioVerified ? "btn btn-secondary text-sm" : "btn btn-primary text-sm"}
                >
                    {busy
                        ? "Saving…"
                        : audioVerified
                            ? "Unapprove audio"
                            : "Approve audio"}
                </button>
                {error && (
                    <span className="text-sm text-[var(--error)]">{error}</span>
                )}
            </div>
        </div>
    );
}
