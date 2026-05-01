"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import WordCard from "@/components/WordCard";
import FlagDialog, { type FlagDialogResult } from "@/components/FlagDialog";
import type { Word, GradeLevel } from "@/lib/types";
import { GRADE_LEVELS, GRADE_LEVEL_LABEL } from "@/lib/types";
import GradeBadge from "@/components/GradeBadge";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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

  // Highest data-cell value (excluding totals) — drives the heat-map intensity
  // so the busiest bucket reaches full saturation and quiet buckets fade.
  const visibleGradeRows = GRADE_ROWS.filter((g) => {
    if (g !== "ungraded") return true;
    const t = WORLD_ORDER.reduce((s, w) => s + (matrix?.[g]?.[w] ?? 0), 0);
    return t > 0;
  });
  const maxCellValue = visibleGradeRows.reduce((m, g) => {
    return WORLD_ORDER.reduce((mm, w) => Math.max(mm, matrix?.[g]?.[w] ?? 0), m);
  }, 0);

  const colTotals: Record<WorldId, number> = WORLD_ORDER.reduce((acc, wid) => {
    acc[wid] = visibleGradeRows.reduce(
      (s, g) => s + (matrix?.[g]?.[wid] ?? 0), 0,
    );
    return acc;
  }, {} as Record<WorldId, number>);
  const grandTotal = WORLD_ORDER.reduce((s, w) => s + colTotals[w], 0);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
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
          <div className="bucket-card">
            <div className="bucket-table-scroll">
              <table className="bucket-table">
                <thead>
                  <tr>
                    <th scope="col" className="bucket-th bucket-th--grade">
                      Grade
                    </th>
                    {WORLD_ORDER.map((wid) => (
                      <th
                        key={wid}
                        scope="col"
                        className="bucket-th bucket-th--world"
                      >
                        <div className="bucket-th__stack">
                          <span
                            className="bucket-th__icon"
                            aria-hidden="true"
                          >
                            {WORLDS[wid].emoji}
                          </span>
                          <span className="bucket-th__label">
                            {WORLDS[wid].name}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th scope="col" className="bucket-th bucket-th--total">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {GRADE_ROWS.map((g) => {
                    const row = matrix?.[g] ?? {} as Record<WorldId, number>;
                    const rowTotal = WORLD_ORDER.reduce(
                      (s, w) => s + (row[w] ?? 0), 0,
                    );
                    // Hide ungraded row when empty — once corpus is fully
                    // graded this row should disappear entirely.
                    if (g === "ungraded" && rowTotal === 0) return null;
                    const wordsHref =
                      g === "ungraded"
                        ? `/words?ungraded=true&verified=false`
                        : `/words?gradeLevel=${g}&verified=false`;
                    return (
                      <tr key={g}>
                        <th
                          scope="row"
                          className="bucket-row-head"
                        >
                          {g === "ungraded" ? (
                            <span className="badge badge-warning">⚠ Ungraded</span>
                          ) : (
                            <GradeBadge value={g} size="md" />
                          )}
                        </th>
                        {WORLD_ORDER.map((wid) => {
                          const count = row[wid] ?? 0;
                          return (
                            <td key={wid} className="bucket-td">
                              <BucketCell
                                count={count}
                                href={`/review?gradeLevel=${g}&world=${wid}`}
                                heat={maxCellValue ? count / maxCellValue : 0}
                                ariaLabel={`${count} pending words in ${WORLDS[wid].name} for ${GRADE_ROW_LABEL(g)}`}
                              />
                            </td>
                          );
                        })}
                        <td className="bucket-td bucket-td--total-col">
                          <BucketCell
                            count={rowTotal}
                            href={wordsHref}
                            strong
                            asLink={rowTotal > 0}
                            ariaLabel={`${rowTotal} pending words for ${GRADE_ROW_LABEL(g)} across all worlds`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bucket-totals-row">
                    <th scope="row" className="bucket-row-head bucket-row-head--total">
                      Total
                    </th>
                    {WORLD_ORDER.map((wid) => (
                      <td key={wid} className="bucket-td bucket-td--total-row">
                        <BucketCell
                          count={colTotals[wid]}
                          href={`/words?world=${wid}&verified=false`}
                          strong
                          asLink={colTotals[wid] > 0}
                          ariaLabel={`${colTotals[wid]} pending words in ${WORLDS[wid].name} across all grades`}
                        />
                      </td>
                    ))}
                    <td className="bucket-td bucket-td--total-row bucket-td--grand">
                      <BucketCell
                        count={grandTotal}
                        href="/words?verified=false"
                        strong
                        asLink
                        ariaLabel={`${grandTotal} pending words across all buckets`}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function BucketCell({
  count,
  href,
  strong,
  asLink = true,
  heat = 0,
  ariaLabel,
}: {
  count: number;
  href: string;
  strong?: boolean;
  asLink?: boolean;
  heat?: number;
  ariaLabel?: string;
}) {
  if (count === 0) {
    return (
      <span className="bucket-cell bucket-cell--empty" aria-label={ariaLabel}>
        —
      </span>
    );
  }
  const label = (
    <span
      className={`bucket-cell ${strong ? "bucket-cell--strong" : ""}`}
      style={heat > 0 ? { ["--heat" as string]: heat.toFixed(3) } : undefined}
      data-heat={heat > 0 ? "on" : undefined}
    >
      <span className="bucket-cell__num">{count.toLocaleString()}</span>
    </span>
  );
  if (!asLink) {
    return (
      <span aria-label={ariaLabel} className="bucket-cell-wrap bucket-cell-wrap--static">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="bucket-cell-wrap"
    >
      {label}
    </Link>
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
  // Default ON — once a reviewer verifies a word they usually want it gone
  // from the queue so they can power through the remaining pending pile.
  const [hideVerified, setHideVerified] = useState(true);

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
    if (alreadyFlagged) {
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
      return;
    }
    setFlagTargetId(id);
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

  const pendingCount = words.filter((w) => !w.verified && !w.declined).length;
  const verifiedCount = words.filter((w) => w.verified).length;
  const declinedCount = words.filter((w) => w.declined).length;
  const visibleWords = hideVerified
    ? words.filter((w) => !w.verified)
    : words;

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
              {hideVerified && verifiedCount > 0
                ? `${verifiedCount} verified ${verifiedCount === 1 ? "word is" : "words are"} hidden — toggle "Verified" to show them.`
                : "No words pending review in this bucket."}
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
                isLoading={actingId === w.id}
              />
            ))}
          </div>
        )}
      </main>
      {flagTargetId && (
        <FlagDialog
          word={words.find((w) => w.id === flagTargetId)?.word ?? "this word"}
          onSubmit={submitFlag}
          onCancel={() => setFlagTargetId(null)}
        />
      )}
    </div>
  );
}

