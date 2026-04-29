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

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
            Pick a Review Bucket
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Choose a grade and world to focus on. Each cell shows how many
            words are still pending in that bucket.
          </p>
        </div>

        {loading ? (
          <div className="card p-12 text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">Loading buckets...</p>
          </div>
        ) : (
          <div className="card p-6 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Grade</th>
                  {WORLD_ORDER.map((wid) => (
                    <th key={wid} className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <span>{WORLDS[wid].emoji}</span>
                        <span className="hidden md:inline">{WORLDS[wid].name}</span>
                      </span>
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {GRADE_ROWS.map((g) => {
                  const row = matrix?.[g] ?? {} as Record<WorldId, number>;
                  const rowTotal = WORLD_ORDER.reduce(
                    (s, w) => s + (row[w] ?? 0), 0,
                  );
                  // Hide the ungraded row when there's nothing in it — once
                  // the corpus is fully graded this row should disappear.
                  if (g === "ungraded" && rowTotal === 0) return null;
                  const wordsHref =
                    g === "ungraded"
                      ? `/words?ungraded=true&verified=false`
                      : `/words?gradeLevel=${g}&verified=false`;
                  return (
                    <tr key={g}>
                      <td>
                        {g === "ungraded" ? (
                          <span className="badge badge-warning">⚠ Ungraded</span>
                        ) : (
                          <GradeBadge value={g} />
                        )}
                      </td>
                      {WORLD_ORDER.map((wid) => {
                        const count = row[wid] ?? 0;
                        return (
                          <td key={wid} className="text-right">
                            <BucketCell
                              count={count}
                              href={`/review?gradeLevel=${g}&world=${wid}`}
                            />
                          </td>
                        );
                      })}
                      <td className="text-right">
                        <BucketCell
                          count={rowTotal}
                          href={wordsHref}
                          strong
                          asLink={rowTotal > 0}
                        />
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="font-medium text-[var(--text-secondary)]">Total</td>
                  {WORLD_ORDER.map((wid) => {
                    const colTotal = GRADE_ROWS.reduce(
                      (s, g) => s + (matrix?.[g]?.[wid] ?? 0), 0,
                    );
                    return (
                      <td key={wid} className="text-right">
                        <BucketCell
                          count={colTotal}
                          href={`/words?world=${wid}&verified=false`}
                          strong
                          asLink={colTotal > 0}
                        />
                      </td>
                    );
                  })}
                  <td className="text-right">
                    <BucketCell
                      count={GRADE_ROWS.reduce(
                        (s, g) => s + WORLD_ORDER.reduce(
                          (t, w) => t + (matrix?.[g]?.[w] ?? 0), 0,
                        ), 0,
                      )}
                      href="/words?verified=false"
                      strong
                      asLink
                    />
                  </td>
                </tr>
              </tbody>
            </table>
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
}: {
  count: number;
  href: string;
  strong?: boolean;
  asLink?: boolean;
}) {
  if (count === 0) {
    return <span className="text-[var(--text-tertiary)]">—</span>;
  }
  const label = (
    <span className={strong ? "font-semibold" : "font-medium"}>
      {count.toLocaleString()}
    </span>
  );
  if (!asLink) return label;
  return (
    <Link href={href} className="hover:text-[var(--accent-hover)]">
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

  const worldMeta = WORLDS[world];

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("verified", "false");
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

  const handleEdit = (id: string) => router.push(`/words/${id}?from=review`);

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

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link
            href="/review"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ← Change bucket
          </Link>
          <div className="flex items-center justify-between mt-2 gap-4 flex-wrap">
            <h1 className="text-3xl font-semibold text-[var(--text-primary)] flex items-center gap-3 flex-wrap">
              {gradeRow === "ungraded" ? (
                <>
                  <span className="badge badge-warning">⚠ Ungraded</span>
                  <span>Ungraded</span>
                </>
              ) : (
                <>
                  <GradeBadge value={gradeRow} />
                  <span>{GRADE_LEVEL_LABEL[gradeRow]}</span>
                </>
              )}
              <span className="text-[var(--text-secondary)]">·</span>
              <span className="flex items-center gap-2">
                <span>{worldMeta.emoji}</span>
                <span>{worldMeta.name}</span>
              </span>
            </h1>
            <div className="flex items-center gap-4 text-right">
              <div>
                <div className="text-2xl font-semibold text-[var(--warning)]">
                  {pendingCount}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">Pending</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-[var(--success)]">
                  {verifiedCount}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">Verified</div>
              </div>
              {declinedCount > 0 && (
                <div>
                  <div className="text-2xl font-semibold text-[var(--error)]">
                    {declinedCount}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">Declined</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card p-12 text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">Loading words...</p>
          </div>
        ) : words.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-xl font-semibold mb-2">All caught up!</h2>
            <p className="text-[var(--text-secondary)]">
              No words pending review in this bucket.
            </p>
            <Link href="/review" className="btn btn-secondary mt-6 inline-flex">
              Pick another bucket
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {words.map((w) => (
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

