"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import WordCard from "@/components/WordCard";
import FlagDialog, { type FlagDialogResult, type FlagReasonKey } from "@/components/FlagDialog";
import ImageGenerateModal from "@/components/ImageGenerateModal";
import type { Word, GradeLevel } from "@/lib/types";
import { GRADE_LEVELS, GRADE_LEVEL_LABEL } from "@/lib/types";
import GradeBadge from "@/components/GradeBadge";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { WORLDS, type WorldId } from "@/lib/worlds";

const GRADE_ROW_LABEL = (g: GradeLevel | "ungraded") =>
  g === "ungraded" ? "Ungraded" : GRADE_LEVEL_LABEL[g];

// Picker rows: the six grades plus an "ungraded" row that surfaces words
// without a grade tag yet (should be empty post-curation but kept as a
// safety net for any future imports).
const GRADE_ROWS: (GradeLevel | "ungraded")[] = [
  ...GRADE_LEVELS,
  "ungraded",
];
const WORLD_ORDER: WorldId[] = [
  "animals", "food", "nature", "space", "objects", "magic", "sight", "feelings",
];

// Per-card world emoji overrides. The WORLDS catalog uses 🏰 for magic and
// 💗 for feelings — those scan as "fortress" and "love-letter" respectively
// in this dense card layout, so we substitute a wand and a green heart.
// Falls back to the canonical emoji for any world without an override.
const CARD_WORLD_EMOJI: Partial<Record<WorldId, string>> = {
  magic: "🪄",
  feelings: "💚",
};

// Card-view grade display: PNG icon (desktop) + emoji (mobile) + label. The
// PNGs match the GradeBadge pill icons used elsewhere; the emoji shows on
// phones where a colored 36px image takes too much vertical space in a
// stacked-divider list. `emoji`-only entries (ungraded / total) render the
// same on every viewport.
const GRADE_CARD: Record<
  GradeLevel | "ungraded" | "total",
  { icon?: string; emoji: string; label: string }
> = {
  k:        { icon: "/grade-icons/bunny.png", emoji: "🐰", label: "Kindergarten" },
  "1":      { icon: "/grade-icons/fox.png",   emoji: "🦊", label: "1st Grade" },
  "2":      { icon: "/grade-icons/deer.png",  emoji: "🦌", label: "2nd Grade" },
  "3":      { icon: "/grade-icons/owl.png",   emoji: "🦉", label: "3rd Grade" },
  "4":      { icon: "/grade-icons/bear.png",  emoji: "🐻", label: "4th Grade" },
  ungraded: {                                 emoji: "⚠️", label: "Ungraded" },
  total:    {                                 emoji: "🏆", label: "All Grades Total" },
};

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewInner />
    </Suspense>
  );
}

function ReviewInner() {
  const searchParams = useSearchParams();
  const { status } = useSession();
  const router = useRouter();

  const gradeLevelParam = searchParams.get("gradeLevel");
  const world = searchParams.get("world") as WorldId | null;
  const isValidGradeRow = (v: string | null): v is GradeLevel | "ungraded" =>
    v !== null && (GRADE_ROWS as string[]).includes(v);
  const bucketSelected =
    !!gradeLevelParam && !!world &&
    isValidGradeRow(gradeLevelParam) && WORLD_ORDER.includes(world);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="card p-12 text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  return bucketSelected ? (
    <BucketReview gradeRow={gradeLevelParam as GradeLevel | "ungraded"} world={world!} />
  ) : (
    <BucketPicker />
  );
}

// ---- Bucket picker -----------------------------------------------------------

function BucketPicker() {
  const [matrix, setMatrix] = useState<
    Record<string, Record<WorldId, number>> | null
  >(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/words/stats?byWorldAndGrade=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setMatrix(data?.pendingByWorldAndGrade ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Per-world totals across all grades, plus the grand total. Ungraded only
  // counts when it has pending words — once curation is complete that row
  // disappears from the totals too.
  const includedGradeRows = GRADE_ROWS.filter((g) => {
    if (g !== "ungraded") return true;
    const t = WORLD_ORDER.reduce((s, w) => s + (matrix?.[g]?.[w] ?? 0), 0);
    return t > 0;
  });
  const colTotals: Record<WorldId, number> = WORLD_ORDER.reduce((acc, wid) => {
    acc[wid] = includedGradeRows.reduce(
      (s, g) => s + (matrix?.[g]?.[wid] ?? 0),
      0,
    );
    return acc;
  }, {} as Record<WorldId, number>);
  const grandTotal = WORLD_ORDER.reduce((s, w) => s + colTotals[w], 0);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="bucket-picker-main">
        <header className="mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
            Pick a Review Bucket
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)] max-w-2xl">
            Choose a grade and world to focus on. Each cell shows how many
            words are still pending in that bucket.
          </p>
        </header>

        {loading ? (
          <div className="card p-12 text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">Loading buckets...</p>
          </div>
        ) : (
          <div className="grade-card-grid">
            {GRADE_ROWS.map((g) => {
              const row = matrix?.[g] ?? ({} as Record<WorldId, number>);
              const rowTotal = WORLD_ORDER.reduce((s, w) => s + (row[w] ?? 0), 0);
              // Hide ungraded card when empty — once corpus is fully
              // graded this row should disappear entirely.
              if (g === "ungraded" && rowTotal === 0) return null;
              const totalHref =
                g === "ungraded"
                  ? `/words?ungraded=true&verified=false`
                  : `/words?gradeLevel=${g}&verified=false`;
              const card = GRADE_CARD[g];
              return (
                <GradeBucketCard
                  key={g}
                  icon={card.icon}
                  emoji={card.emoji}
                  label={card.label}
                  pendingTotal={rowTotal}
                  pendingHref={totalHref}
                  pendingAriaLabel={`${rowTotal} pending words for ${GRADE_ROW_LABEL(g)} across all worlds`}
                  cellHrefBuilder={(wid) => `/review?gradeLevel=${g}&world=${wid}`}
                  cellAriaBuilder={(wid, count) =>
                    `${count} pending words in ${WORLDS[wid].name} for ${GRADE_ROW_LABEL(g)}`
                  }
                  counts={row}
                />
              );
            })}
            <GradeBucketCard
              emoji={GRADE_CARD.total.emoji}
              label={GRADE_CARD.total.label}
              pendingTotal={grandTotal}
              pendingHref="/words?verified=false"
              pendingAriaLabel={`${grandTotal} pending words across all buckets`}
              cellHrefBuilder={(wid) => `/words?world=${wid}&verified=false`}
              cellAriaBuilder={(wid, count) =>
                `${count} pending words in ${WORLDS[wid].name} across all grades`
              }
              counts={colTotals}
              tone="total"
            />
          </div>
        )}
      </main>
    </div>
  );
}

// Single grade card: header (emoji + label + pending pill) over a 2-col grid
// of world cells. A non-zero count renders as a teal-accented link; a zero
// count is an inert em-dash. Used for both per-grade and "All Grades Total"
// cards — `tone="total"` swaps in the gradient background.
function GradeBucketCard({
  icon,
  emoji,
  label,
  pendingTotal,
  pendingHref,
  pendingAriaLabel,
  cellHrefBuilder,
  cellAriaBuilder,
  counts,
  tone = "default",
}: {
  icon?: string;
  emoji?: string;
  label: string;
  pendingTotal: number;
  pendingHref: string;
  pendingAriaLabel: string;
  cellHrefBuilder: (wid: WorldId) => string;
  cellAriaBuilder: (wid: WorldId, count: number) => string;
  counts: Record<WorldId, number>;
  tone?: "default" | "total";
}) {
  const pendingLabel = `${pendingTotal.toLocaleString()} pending`;
  return (
    <section
      className={`grade-card ${tone === "total" ? "grade-card--total" : ""}`}
      aria-label={`${label} review bucket`}
    >
      <header className="grade-card__head">
        <div className="grade-card__title">
          {icon && (
            <Image
              src={icon}
              alt=""
              width={36}
              height={36}
              className="grade-card__icon"
              aria-hidden="true"
            />
          )}
          {/* Emoji is the mobile-only icon when the grade has a PNG (CSS
              hides one or the other). For ungraded / total cards there's no
              PNG, so emoji shows on every viewport. */}
          <span
            className={`grade-card__emoji ${icon ? "grade-card__emoji--mobile-only" : ""}`}
            aria-hidden
          >
            {emoji}
          </span>
          <span className="grade-card__label">{label}</span>
        </div>
        {pendingTotal > 0 ? (
          <Link
            href={pendingHref}
            aria-label={pendingAriaLabel}
            className="grade-card__pending grade-card__pending--link"
          >
            {pendingLabel}
          </Link>
        ) : (
          <span
            aria-label={pendingAriaLabel}
            className="grade-card__pending"
          >
            {pendingLabel}
          </span>
        )}
      </header>
      <div className="grade-card__grid">
        {WORLD_ORDER.map((wid) => {
          const count = counts[wid] ?? 0;
          const world = WORLDS[wid];
          const cellEmoji = CARD_WORLD_EMOJI[wid] ?? world.emoji;
          if (count === 0) {
            return (
              <span
                key={wid}
                className="world-cell world-cell--empty"
                aria-label={cellAriaBuilder(wid, 0)}
              >
                <span className="world-cell__label">
                  <span className="world-cell__icon" aria-hidden>{cellEmoji}</span>
                  <span className="world-cell__name">{world.name}</span>
                </span>
                <span className="world-cell__count" aria-hidden>—</span>
              </span>
            );
          }
          return (
            <Link
              key={wid}
              href={cellHrefBuilder(wid)}
              aria-label={cellAriaBuilder(wid, count)}
              className="world-cell world-cell--link"
            >
              <span className="world-cell__label">
                <span className="world-cell__icon" aria-hidden>{cellEmoji}</span>
                <span className="world-cell__name">{world.name}</span>
              </span>
              <span className="world-cell__count">{count.toLocaleString()}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ---- Bucket review (full scrolling list) -------------------------------------

function BucketReview({
  gradeRow,
  world,
}: {
  gradeRow: GradeLevel | "ungraded";
  world: WorldId;
}) {
  const router = useRouter();
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [flagTargetId, setFlagTargetId] = useState<string | null>(null);
  // When opening the dialog on an already-flagged word, hydrate from the
  // server so the reviewer can see / edit what was previously submitted.
  const [flagInitialReasons, setFlagInitialReasons] = useState<FlagReasonKey[]>([]);
  const [flagInitialNote, setFlagInitialNote] = useState<string>("");
  const [flagInitialLoading, setFlagInitialLoading] = useState(false);
  // Default ON — once a reviewer verifies a word they usually want it gone
  // from the queue so they can power through the remaining pending pile.
  const [hideVerified, setHideVerified] = useState(true);
  // Default ON — flagged words are parked for someone else to look at, so
  // they shouldn't clutter the regular review pile.
  const [hideFlagged, setHideFlagged] = useState(true);
  const [imageTargetId, setImageTargetId] = useState<string | null>(null);

  const worldMeta = WORLDS[world];

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    // Load the whole bucket — pending AND historically verified — so the
    // "Verified" toggle in the header can reveal them. Hidden by default
    // (hideVerified = true) so reviewers see the pending pile first.
    params.set("world", world);
    if (gradeRow === "ungraded") {
      params.set("ungraded", "true");
    } else {
      params.set("gradeLevel", gradeRow);
    }
    // Pull the whole bucket so the reviewer can scroll through everything in
    // one pass — buckets stay small (a few hundred at most) since they're
    // scoped to one grade × one world.
    params.set("pageSize", "500");
    fetch(`/api/words?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setWords(data?.words || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [gradeRow, world]);

  const handleVerify = async (id: string) => {
    setActingId(id);
    const r = await fetch(`/api/words/${id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: true }),
    });
    if (r.ok) {
      // Mark in place — keep the row visible so reviewer sees their action
      // and can undo by toggling back, but it drops out of "still pending".
      setWords((prev) =>
        prev.map((w) =>
          w.id === id ? { ...w, verified: true, declined: false } : w,
        ),
      );
    }
    setActingId(null);
  };

  const handleVerifyAudio = async (id: string, next: boolean) => {
    setActingId(id);
    const r = await fetch(`/api/words/${id}/audio/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioVerified: next }),
    });
    if (r.ok) {
      const data = await r.json();
      setWords((prev) =>
        prev.map((w) =>
          w.id === id
            ? {
                ...w,
                audio_verified: data.audio_verified,
                audio_verified_at: data.audio_verified_at,
                audio_verified_by: data.audio_verified_by,
              }
            : w,
        ),
      );
    }
    setActingId(null);
  };

  const handleReject = async (id: string) => {
    setActingId(id);
    await fetch(`/api/words/${id}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declined: true }),
    });
    setWords((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, declined: true, verified: false } : w,
      ),
    );
    setActingId(null);
  };

  const handleEdit = (id: string) => {
    const params = new URLSearchParams({ from: "review", world });
    if (gradeRow === "ungraded") {
      params.set("ungraded", "true");
    } else {
      params.set("gradeLevel", gradeRow);
    }
    router.push(`/words/${id}?${params.toString()}`);
  };

  const handleFlag = async (id: string) => {
    const word = words.find((w) => w.id === id);
    const alreadyFlagged = word?.flagged ?? false;
    // Always open the dialog so the reviewer can see what (if anything) was
    // previously flagged. For already-flagged words, fetch the latest flag's
    // reasons + note so the form reflects the existing state — otherwise the
    // dialog opens blank and prior context is invisible.
    setFlagInitialReasons([]);
    setFlagInitialNote("");
    setFlagTargetId(id);
    if (alreadyFlagged) {
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
    setActingId(id);
    await fetch(`/api/words/${id}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flagged: true,
        reasons: result.reasons,
        note: result.note || undefined,
      }),
    });
    setWords((prev) =>
      prev.map((w) => (w.id === id ? { ...w, flagged: true } : w)),
    );
    setActingId(null);
  };

  const unflagFromDialog = async () => {
    const id = flagTargetId;
    if (!id) return;
    setFlagTargetId(null);
    setActingId(id);
    await fetch(`/api/words/${id}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged: false }),
    });
    setWords((prev) =>
      prev.map((w) => (w.id === id ? { ...w, flagged: false } : w)),
    );
    setActingId(null);
  };

  const pendingCount = words.filter((w) => !w.verified && !w.declined).length;
  const verifiedCount = words.filter((w) => w.verified).length;
  const declinedCount = words.filter((w) => w.declined).length;
  const flaggedCount = words.filter((w) => w.flagged).length;
  const visibleWords = words.filter(
    (w) => !(hideVerified && w.verified) && !(hideFlagged && w.flagged),
  );

  return (
    <div className="min-h-screen">
      <Header />
      <div className="bucket-review-header">
        <div className="bucket-review-header__inner">
          <Link href="/review" className="bucket-review-back">
            ← Change bucket
          </Link>
          <div className="bucket-review-row">
            <h1 className="bucket-review-title">
              {gradeRow === "ungraded" ? (
                <span className="badge badge-warning">⚠ Ungraded</span>
              ) : (
                <GradeBadge value={gradeRow} size="md" />
              )}
              <span className="bucket-review-title__sep">·</span>
              <span className="bucket-review-title__world">
                <span aria-hidden="true">{worldMeta.emoji}</span>
                <span>{worldMeta.name}</span>
              </span>
            </h1>
            <div className="bucket-review-counters">
              <div>
                <div
                  className="bucket-review-counter__num"
                  style={{ color: "var(--warning)" }}
                >
                  {pendingCount}
                </div>
                <div className="bucket-review-counter__label">Pending</div>
              </div>
              <button
                type="button"
                onClick={() => setHideVerified((v) => !v)}
                className="hide-verified-btn"
                aria-pressed={hideVerified}
                title={
                  hideVerified
                    ? "Show verified words in the list"
                    : "Hide verified words from the list"
                }
              >
                <span
                  className="bucket-review-counter__num"
                  style={{ color: "var(--success)" }}
                >
                  {verifiedCount}
                </span>
                <span className="bucket-review-counter__label flex items-center gap-1">
                  Verified
                  <span aria-hidden="true">
                    {hideVerified ? "🙈" : "👁"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setHideFlagged((v) => !v)}
                className="hide-verified-btn"
                aria-pressed={hideFlagged}
                title={
                  hideFlagged
                    ? "Show flagged words in the list"
                    : "Hide flagged words from the list"
                }
              >
                <span
                  className="bucket-review-counter__num"
                  style={{ color: "var(--warning)" }}
                >
                  {flaggedCount}
                </span>
                <span className="bucket-review-counter__label flex items-center gap-1">
                  Flagged
                  <span aria-hidden="true">
                    {hideFlagged ? "🙈" : "👁"}
                  </span>
                </span>
              </button>
              {declinedCount > 0 && (
                <div>
                  <div
                    className="bucket-review-counter__num"
                    style={{ color: "var(--error)" }}
                  >
                    {declinedCount}
                  </div>
                  <div className="bucket-review-counter__label">Declined</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <main className="page-container max-w-4xl">

        {loading ? (
          <div className="card p-12 text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">Loading words...</p>
          </div>
        ) : visibleWords.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-xl font-semibold mb-2">All caught up!</h2>
            <p className="text-[var(--text-secondary)]">
              {(() => {
                const hidden: string[] = [];
                if (hideVerified && verifiedCount > 0) hidden.push(`${verifiedCount} verified`);
                if (hideFlagged && flaggedCount > 0) hidden.push(`${flaggedCount} flagged`);
                if (hidden.length === 0) return "No words pending review in this bucket.";
                const total = (hideVerified ? verifiedCount : 0) + (hideFlagged ? flaggedCount : 0);
                return `${hidden.join(" and ")} ${total === 1 ? "word is" : "words are"} hidden — toggle to show them.`;
              })()}
            </p>
            <Link href="/review" className="btn btn-secondary mt-6 inline-flex">
              Pick another bucket
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {visibleWords.map((w) => (
              <WordCard
                key={w.id}
                word={w}
                showActions
                onVerify={handleVerify}
                onReject={handleReject}
                onEdit={handleEdit}
                onFlag={handleFlag}
                onGenerateImage={(id) => setImageTargetId(id)}
                onVerifyAudio={handleVerifyAudio}
                isLoading={actingId === w.id}
              />
            ))}
          </div>
        )}
      </main>
      {flagTargetId && (
        <FlagDialog
          word={words.find((w) => w.id === flagTargetId)?.word ?? "this word"}
          alreadyFlagged={
            words.find((w) => w.id === flagTargetId)?.flagged ?? false
          }
          loadingExisting={flagInitialLoading}
          initialReasons={flagInitialReasons}
          initialNote={flagInitialNote}
          onSubmit={submitFlag}
          onUnflag={unflagFromDialog}
          onCancel={() => setFlagTargetId(null)}
        />
      )}
      {imageTargetId && (
        <ImageGenerateModal
          wordId={imageTargetId}
          word={words.find((w) => w.id === imageTargetId)?.word ?? "this word"}
          onClose={() => setImageTargetId(null)}
        />
      )}
    </div>
  );
}

