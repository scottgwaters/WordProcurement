"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import type { AgeGroup, GradeLevel, Level } from "@/lib/types";
import { GRADE_LEVELS, GRADE_LEVEL_LABEL } from "@/lib/types";
import { worldForCategory, WORLDS, CATEGORIES_BY_WORLD, type WorldId } from "@/lib/worlds";

type Variant = {
  id: string;
  word: string;
  age_group: AgeGroup;
  grade_level: GradeLevel | null;
  level: Level;
  category: string;
  hints: { easy?: string; medium?: string; hard?: string } | null;
  pronunciation: string | null;
  pronunciation_arpabet: string | null;
  pronunciation_respelling: string | null;
  part_of_speech: string | null;
  definition: string | null;
  example_sentence: string | null;
  heart_word_explanation: string | null;
  verified: boolean;
  version: number;
};

// Fields a reviewer almost always wants to keep identical across age-group
// variants of the same spelling. Editing these once here fans out via the
// grouped PATCH endpoint so the age tiers never silently diverge.
type SharedFields = {
  definition: string;
  part_of_speech: string;
  pronunciation: string;
  pronunciation_arpabet: string;
  pronunciation_respelling: string;
  example_sentence: string;
  heart_word_explanation: string;
  category: string;
  source: string;
};

export default function GroupedWordPage({
  params,
}: {
  params: Promise<{ word: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = from === "review" ? "/review" : "/words";
  const backLabel = from === "review" ? "Back to review" : "Back to words";

  const { status } = useSession();
  const [spelling, setSpelling] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [shared, setShared] = useState<SharedFields>({
    definition: "",
    part_of_speech: "",
    pronunciation: "",
    pronunciation_arpabet: "",
    pronunciation_respelling: "",
    example_sentence: "",
    heart_word_explanation: "",
    category: "",
    source: "",
  });
  const [variantEdits, setVariantEdits] = useState<
    Record<string, { level: Level; hints_easy: string; hints_medium: string; hints_hard: string; grade_level: GradeLevel }>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchGroup = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    const res = await fetch(
      `/api/words/group/${encodeURIComponent(resolvedParams.word)}`
    );
    if (!res.ok) {
      setError("No variants found for this spelling");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setSpelling(data.word);
    setVariants(data.variants);

    // Seed shared fields from the first variant — if they differ across
    // variants, the reviewer can pick which one to keep by editing; the
    // save will fan it out. Flagged below so they know there's drift.
    const first = data.variants[0];
    setShared({
      definition: first.definition ?? "",
      part_of_speech: first.part_of_speech ?? "",
      pronunciation: first.pronunciation ?? "",
      pronunciation_arpabet: first.pronunciation_arpabet ?? "",
      pronunciation_respelling: first.pronunciation_respelling ?? "",
      example_sentence: first.example_sentence ?? "",
      heart_word_explanation: first.heart_word_explanation ?? "",
      category: first.category ?? "",
      source: first.source ?? "",
    });

    const edits: typeof variantEdits = {};
    for (const v of data.variants as Variant[]) {
      edits[v.id] = {
        level: v.level,
        hints_easy: v.hints?.easy ?? "",
        hints_medium: v.hints?.medium ?? "",
        hints_hard: v.hints?.hard ?? "",
        grade_level: (v.grade_level ?? "k") as GradeLevel,
      };
    }
    setVariantEdits(edits);
    setLoading(false);
  }, [status, resolvedParams.word]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") fetchGroup();
  }, [status, fetchGroup, router]);

  // Show a warning if any "shared" field actually differs across
  // variants today — saving will unify them, but the reviewer should
  // notice before they overwrite something intentional.
  const drift = (() => {
    if (variants.length < 2) return [] as string[];
    const drifted: string[] = [];
    const keys: [keyof Variant, keyof SharedFields][] = [
      ["definition", "definition"],
      ["part_of_speech", "part_of_speech"],
      ["pronunciation", "pronunciation"],
      ["pronunciation_arpabet", "pronunciation_arpabet"],
      ["pronunciation_respelling", "pronunciation_respelling"],
      ["example_sentence", "example_sentence"],
      ["heart_word_explanation", "heart_word_explanation"],
      ["category", "category"],
    ];
    for (const [vKey] of keys) {
      const values = new Set(variants.map((v) => v[vKey] ?? null));
      if (values.size > 1) drifted.push(String(vKey));
    }
    return drifted;
  })();

  const currentWorld = worldForCategory(shared.category).world;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const res = await fetch(
      `/api/words/group/${encodeURIComponent(spelling)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shared,
          variants: variants.map((v) => {
            const e = variantEdits[v.id];
            return {
              id: v.id,
              version: v.version,
              level: e.level,
              gradeLevel: e.grade_level,
              hints: {
                easy: e.hints_easy,
                medium: e.hints_medium,
                hard: e.hints_hard,
              },
            };
          }),
        }),
      }
    );
    if (res.status === 409) {
      setError(
        "One or more variants were edited elsewhere. Reload to pick up the changes."
      );
    } else if (!res.ok) {
      setError("Save failed");
    } else {
      setSuccess("All variants saved");
      await fetchGroup();
    }
    setSaving(false);
  };

  const handleVerifyAll = async (verified: boolean) => {
    setSaving(true);
    const res = await fetch(
      `/api/words/group/${encodeURIComponent(spelling)}/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      }
    );
    if (res.ok) {
      setSuccess(verified ? "All variants approved" : "All variants declined");
      await fetchGroup();
    } else {
      setError("Bulk action failed");
    }
    setSaving(false);
  };

  const handleVerifyOne = async (variantId: string, verified: boolean) => {
    setSaving(true);
    const res = await fetch(
      `/api/words/group/${encodeURIComponent(spelling)}/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified, variantIds: [variantId] }),
      }
    );
    if (res.ok) {
      await fetchGroup();
    } else {
      setError("Action failed");
    }
    setSaving(false);
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="card p-12 text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">Loading variants…</p>
          </div>
        </main>
      </div>
    );
  }

  if (error && variants.length === 0) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="card p-12 text-center">
            <p>{error}</p>
            <Link href={backHref} className="btn btn-primary mt-4">
              {backLabel}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const allVerified = variants.length > 0 && variants.every((v) => v.verified);
  const anyPending = variants.some((v) => !v.verified);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={backHref}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ← {backLabel}
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-semibold text-[var(--text-primary)] uppercase tracking-wide">
              {spelling}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-[var(--text-secondary)]">
                {variants.length} grade variant{variants.length > 1 ? "s" : ""}:{" "}
                {variants
                  .map((v) =>
                    v.grade_level ? GRADE_LEVEL_LABEL[v.grade_level] : "ungraded",
                  )
                  .join(" · ")}
              </span>
              {currentWorld && (
                <span
                  className="badge badge-neutral"
                  title={`${currentWorld.tagline}\n\n${currentWorld.description}`}
                >
                  {currentWorld.emoji} {currentWorld.name}
                </span>
              )}
              {allVerified ? (
                <span className="badge badge-success">All verified</span>
              ) : (
                <span className="badge badge-warning">
                  {variants.filter((v) => !v.verified).length} pending
                </span>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-[var(--error-bg)] text-[var(--error)] px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-[var(--success-bg)] text-[var(--success)] px-4 py-3 rounded-lg mb-6 text-sm">
            {success}
          </div>
        )}

        {drift.length > 0 && (
          <div className="bg-[var(--warning-bg)] text-[var(--text-primary)] border border-[var(--warning)] px-4 py-3 rounded-lg mb-6 text-sm">
            <div className="font-medium text-[var(--warning)] mb-1">
              Variants have diverged on shared fields
            </div>
            <p className="text-[var(--text-secondary)]">
              The following fields differ across age-group variants today:{" "}
              <span className="font-medium">
                {drift.map((f) => f.replace(/_/g, " ")).join(", ")}
              </span>
              . Editing them here will unify them across all variants on save.
            </p>
          </div>
        )}

        {/* Shared fields — edited once, saved to every variant. */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">Shared word details</h2>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            These fields apply to every age-group variant of this word. Edits
            here fan out to all {variants.length} variant{variants.length > 1 ? "s" : ""}.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                World
              </label>
              <select
                value={currentWorld?.id ?? ""}
                onChange={(e) => {
                  const newWorldId = e.target.value as WorldId;
                  const currentIsHeart = shared.category === "heart_words";
                  const nextCategory =
                    newWorldId === "sight" && currentIsHeart
                      ? "heart_words"
                      : (CATEGORIES_BY_WORLD[newWorldId]?.[0] ?? shared.category);
                  setShared({ ...shared, category: nextCategory });
                }}
                className="input"
              >
                {Object.values(WORLDS).map((w) => (
                  <option key={w.id} value={w.id} title={w.description}>
                    {w.emoji} {w.name}
                  </option>
                ))}
              </select>
              {currentWorld && (
                <p className="text-xs mt-1 text-[var(--text-secondary)] leading-relaxed">
                  <span className="font-medium text-[var(--text-primary)]">
                    {currentWorld.tagline}.
                  </span>{" "}
                  {currentWorld.description}
                </p>
              )}
              {currentWorld?.id === "sight" && (
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={shared.category === "heart_words"}
                    onChange={(e) =>
                      setShared({
                        ...shared,
                        category: e.target.checked ? "heart_words" : "sight_words",
                      })
                    }
                  />
                  Heart word <span className="text-[var(--text-secondary)] font-normal">(irregular spelling kids memorize)</span>
                </label>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Part of speech
              </label>
              <input
                type="text"
                value={shared.part_of_speech}
                onChange={(e) => setShared({ ...shared, part_of_speech: e.target.value })}
                className="input"
                placeholder="noun, verb, adjective…"
              />
            </div>

          </div>

          {/* Pronunciation: three coordinated fields shared across all age
              variants. Respelling is what kids see in the iOS UI; IPA is the
              source of truth; ARPAbet is the CMUdict intermediate. */}
          <div className="mb-4 border-t border-[var(--border-light)] pt-4">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Pronunciation
              </h3>
              <span className="text-xs text-[var(--text-secondary)]">
                Respelling shows under the word in-game
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Respelling (kid display)
                </label>
                <input
                  type="text"
                  value={shared.pronunciation_respelling}
                  onChange={(e) =>
                    setShared({ ...shared, pronunciation_respelling: e.target.value })
                  }
                  className="input"
                  placeholder="DRAG-un"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  IPA (source of truth)
                </label>
                <input
                  type="text"
                  value={shared.pronunciation}
                  onChange={(e) => setShared({ ...shared, pronunciation: e.target.value })}
                  className="input"
                  placeholder="/ˈdræɡən/"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  ARPAbet (CMUdict)
                </label>
                <input
                  type="text"
                  value={shared.pronunciation_arpabet}
                  onChange={(e) =>
                    setShared({ ...shared, pronunciation_arpabet: e.target.value })
                  }
                  className="input font-mono text-xs"
                  placeholder="D R AE1 G AH0 N"
                />
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Definition
            </label>
            <textarea
              value={shared.definition}
              onChange={(e) => setShared({ ...shared, definition: e.target.value })}
              rows={2}
              className="input"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Example sentence
            </label>
            <textarea
              value={shared.example_sentence}
              onChange={(e) => setShared({ ...shared, example_sentence: e.target.value })}
              rows={2}
              className="input"
            />
          </div>

          {shared.category === "heart_words" && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Heart-word explanation
              </label>
              <textarea
                value={shared.heart_word_explanation}
                onChange={(e) =>
                  setShared({ ...shared, heart_word_explanation: e.target.value })
                }
                rows={2}
                className="input"
              />
            </div>
          )}
        </div>

        {/* Per-variant sections */}
        {variants.map((v) => {
          const edits = variantEdits[v.id];
          if (!edits) return null;
          return (
            <div key={v.id} className="card p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">
                    {v.grade_level ? GRADE_LEVEL_LABEL[v.grade_level] : "Ungraded"}
                    <span className="ml-2 text-sm font-normal text-[var(--text-secondary)]">
                      · Level {v.level}
                    </span>
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {v.verified ? (
                    <span className="badge badge-success">Verified</span>
                  ) : (
                    <span className="badge badge-warning">Pending</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleVerifyOne(v.id, !v.verified)}
                    disabled={saving}
                    className="btn btn-secondary text-xs"
                  >
                    {v.verified ? "Un-verify" : "Verify only this variant"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Level
                  </label>
                  <select
                    value={edits.level}
                    onChange={(e) =>
                      setVariantEdits({
                        ...variantEdits,
                        [v.id]: { ...edits, level: parseInt(e.target.value) as Level },
                      })
                    }
                    className="input"
                  >
                    {[1, 2, 3].map((lvl) => (
                      <option key={lvl} value={lvl}>
                        Level {lvl}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Grade
                  </label>
                  <select
                    value={edits.grade_level}
                    onChange={(e) =>
                      setVariantEdits({
                        ...variantEdits,
                        [v.id]: {
                          ...edits,
                          grade_level: e.target.value as GradeLevel,
                        },
                      })
                    }
                    className="input"
                  >
                    {GRADE_LEVELS.map((g) => (
                      <option key={g} value={g}>
                        {GRADE_LEVEL_LABEL[g]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                {(["easy", "medium", "hard"] as const).map((tier) => {
                  const key = `hints_${tier}` as keyof typeof edits;
                  const value = edits[key] as string;
                  return (
                    <div key={tier}>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1 capitalize">
                        {tier} hint
                      </label>
                      <textarea
                        value={value}
                        onChange={(e) =>
                          setVariantEdits({
                            ...variantEdits,
                            [v.id]: { ...edits, [key]: e.target.value },
                          })
                        }
                        rows={2}
                        className="input"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Sticky action bar at the bottom */}
        <div className="sticky bottom-0 bg-[var(--bg-primary)] border-t border-[var(--border-light)] -mx-6 px-6 py-3 mt-6 flex gap-3 justify-end flex-wrap">
          {anyPending && (
            <button
              type="button"
              onClick={() => handleVerifyAll(true)}
              disabled={saving}
              className="btn btn-approve"
            >
              Approve all variants
            </button>
          )}
          {allVerified && (
            <button
              type="button"
              onClick={() => handleVerifyAll(false)}
              disabled={saving}
              className="btn btn-outline-danger"
            >
              Un-verify all
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? <span className="spinner" /> : "Save all changes"}
          </button>
        </div>
      </main>
    </div>
  );
}
