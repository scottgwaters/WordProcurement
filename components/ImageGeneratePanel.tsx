"use client";

import { useCallback, useEffect, useState } from "react";

// Image-generation panel for the word edit page. Shows the current image
// (loaded via the public /api/words/<id>/image redirect), lets the curator
// type a per-image prompt note + pick a style, and kicks off a job. While
// a job is in flight the panel polls /api/words/<id>/image/job every few
// seconds so the curator sees claimed → done transitions without a manual
// refresh. The actual generation runs on a local Python worker that polls
// /api/image-jobs/next; nothing here blocks on that.

type ImageJob = {
  id: string;
  status: "pending" | "claimed" | "done" | "failed";
  promptNote: string | null;
  style: string | null;
  finalPrompt: string | null;
  errorMessage: string | null;
  textWarning: string | null;
  createdAt: string;
  completedAt: string | null;
};

const STYLE_OPTIONS = [
  { value: "", label: "Default · flat sage storybook" },
  { value: "watercolor", label: "Watercolor" },
  { value: "sticker", label: "Sticker · bold outlines" },
  { value: "soft3d", label: "Soft 3D · plush toy" },
];

export default function ImageGeneratePanel({ wordId }: { wordId: string }) {
  const [job, setJob] = useState<ImageJob | null>(null);
  const [promptNote, setPromptNote] = useState("");
  const [style, setStyle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cache-busting key — bumped on every "done" transition so the <img>
  // re-fetches instead of showing the previous PNG from the browser cache.
  const [imageVersion, setImageVersion] = useState(() => Date.now());

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/words/${wordId}/image/job`);
    if (!res.ok) return;
    const data = await res.json();
    const next: ImageJob | null = data.job ?? null;
    setJob((prev) => {
      // Bump the image cache-buster the moment we observe a done transition
      // so the <img> swaps to the new bytes immediately.
      if (prev && next && prev.status !== "done" && next.status === "done") {
        setImageVersion(Date.now());
      }
      // Seed the form from the prior job's values on first load so the
      // curator can riff on the last attempt instead of starting blank.
      if (!prev && next) {
        if (next.promptNote) setPromptNote(next.promptNote);
        if (next.style) setStyle(next.style);
      }
      return next;
    });
  }, [wordId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // While a job is active, poll every 4 s so the panel transitions to
  // "done" without the curator refreshing. Stop polling once it's
  // settled — done/failed are terminal states.
  useEffect(() => {
    if (!job || (job.status !== "pending" && job.status !== "claimed")) return;
    const t = setInterval(fetchJob, 4000);
    return () => clearInterval(t);
  }, [job, fetchJob]);

  const handleGenerate = async () => {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/words/${wordId}/image/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt_note: promptNote || null,
        style: style || null,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't queue the job. Try again.");
      return;
    }
    const data = await res.json();
    setJob(data.job);
  };

  const inFlight = job?.status === "pending" || job?.status === "claimed";

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold mb-1">Image</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        The local image worker picks up jobs from this queue and uploads
        the new PNG when it&apos;s done. You&apos;ll get a notification.
      </p>

      <div className="grid grid-cols-[160px_1fr] gap-4 mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/words/${wordId}/image?v=${imageVersion}`}
          alt="Current word illustration"
          className="w-40 h-40 object-cover rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]"
          onError={(e) => {
            // Hide broken-image icon when no PNG exists yet.
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
          onLoad={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "visible";
          }}
        />
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Notes for this image
            </label>
            <textarea
              value={promptNote}
              onChange={(e) => setPromptNote(e.target.value)}
              placeholder="What to emphasize / avoid for this attempt — e.g. ‘two of them, smiling’, ‘softer colors’, ‘no humans’."
              className="input"
              rows={3}
              maxLength={1000}
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              The worker also pulls in the active flag note (if any) and
              the word&apos;s definition / example sentence.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Style
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="input"
            >
              {STYLE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleGenerate}
          disabled={submitting || inFlight}
          className="btn btn-primary text-sm"
          title={
            inFlight
              ? "A job is already running for this word"
              : "Queue a fresh image"
          }
        >
          {inFlight ? (
            <>
              <span className="spinner" />
              {job?.status === "claimed" ? "Generating…" : "Queued…"}
            </>
          ) : (
            "Generate image"
          )}
        </button>
        {job?.status === "failed" && (
          <span className="text-sm text-[var(--error)]" title={job.errorMessage ?? ""}>
            Last attempt failed
          </span>
        )}
        {job?.status === "done" && job.completedAt && (
          <span className="text-xs text-[var(--text-secondary)]">
            Last finished{" "}
            {new Date(job.completedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-[var(--error)]">{error}</p>
      )}

      {job?.finalPrompt && (
        <details className="mt-4">
          <summary className="text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            Show prompt used last time
          </summary>
          <pre className="mt-2 text-xs whitespace-pre-wrap font-mono bg-[var(--bg-secondary)] p-3 rounded-md border border-[var(--border)]">
            {job.finalPrompt}
          </pre>
          {job.textWarning && (
            <p className="text-xs text-[var(--warning)] mt-2">
              OCR detected text in the result: {job.textWarning}
            </p>
          )}
        </details>
      )}
    </div>
  );
}
