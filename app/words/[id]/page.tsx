"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import type { Word, AgeGroup, GradeLevel, Level, ActivityLogWithUser } from "@/lib/types";
import { GRADE_LEVELS, GRADE_LEVEL_LABEL } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { worldForCategory, WORLDS, CATEGORIES_BY_WORLD, type WorldId } from "@/lib/worlds";
import { useDialog } from "@/components/Dialog";
import ImageGeneratePanel from "@/components/ImageGeneratePanel";
import WordReviewModal from "@/components/WordReviewModal";

export default function WordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  // Preserve the bucket the reviewer was in (gradeLevel/ungraded + world) so
  // "Back to review" lands on the exact same list, not the bucket picker.
  const backHref = (() => {
    if (from !== "review") return "/words";
    const back = new URLSearchParams();
    const world = searchParams.get("world");
    const gradeLevel = searchParams.get("gradeLevel");
    const ungraded = searchParams.get("ungraded");
    if (world) back.set("world", world);
    if (gradeLevel) back.set("gradeLevel", gradeLevel);
    if (ungraded) back.set("ungraded", ungraded);
    const qs = back.toString();
    return qs ? `/review?${qs}` : "/review";
  })();
  const backLabel = from === "review" ? "Back to review" : "Back to words";
  const [word, setWord] = useState<Word | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityLogWithUser[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [showReview, setShowReview] = useState(false);
  // Cross-tier duplicates for this word's spelling (case-insensitive).
  // Populated after the word loads so the reviewer can spot e.g. "DRAGON
  // already lives in 10-12 / magic" before verifying a new copy.
  type Duplicate = {
    id: string;
    word: string;
    ageGroup: AgeGroup;
    gradeLevel: GradeLevel | null;
    level: Level;
    category: string;
    verified: boolean;
    declined: boolean;
  };
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  // Soft-lock state: if someone else is already editing this word, we
  // show a read-only banner and disable the form rather than let two
  // reviewers stomp on each other.
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  // Optimistic concurrency: set on a 409 save. The banner offers to
  // reload with the server's newer copy (discarding local edits) or
  // keep editing (and overwrite on retry via a fresh version).
  const [saveConflict, setSaveConflict] = useState<{
    currentVersion: number;
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    word: "",
    category: "",
    age_group: "4-6" as AgeGroup,
    grade_level: "k" as GradeLevel,
    level: 1 as Level,
    hints_easy: "",
    hints_medium: "",
    hints_hard: "",
    definition: "",
    example_sentence: "",
    part_of_speech: "",
    pronunciation: "",
    pronunciation_arpabet: "",
    pronunciation_respelling: "",
    heart_word_explanation: "",
  });
  // Version token read from the server on load; echoed on PATCH so the
  // server can reject our write if someone else saved first.
  const [version, setVersion] = useState<number>(0);

  const router = useRouter();
  const { status } = useSession();
  const dlg = useDialog();

  const fetchActivity = useCallback(async () => {
    const response = await fetch(`/api/words/${resolvedParams.id}/activity`);
    if (response.ok) {
      const data = await response.json();
      setActivity(data);
    }
  }, [resolvedParams.id]);

  const fetchWord = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);

    const response = await fetch(`/api/words/${resolvedParams.id}`);

    if (!response.ok) {
      setError("Word not found");
      setIsLoading(false);
      return;
    }

    const data = await response.json();
    setWord(data);
    setFormData({
      word: data.word,
      category: data.category,
      age_group: data.age_group,
      grade_level: (data.grade_level ?? "k") as GradeLevel,
      level: data.level,
      hints_easy: data.hints?.easy || "",
      hints_medium: data.hints?.medium || "",
      hints_hard: data.hints?.hard || "",
      definition: data.definition || "",
      example_sentence: data.example_sentence || "",
      part_of_speech: data.part_of_speech || "",
      pronunciation: data.pronunciation || "",
      pronunciation_arpabet: data.pronunciation_arpabet || "",
      pronunciation_respelling: data.pronunciation_respelling || "",
      heart_word_explanation: data.heart_word_explanation || "",
    });
    setVersion(typeof data.version === "number" ? data.version : 0);

    setIsLoading(false);
    fetchActivity();
  }, [status, resolvedParams.id, fetchActivity]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchWord();
    }
  }, [status, fetchWord, router]);

  // Once the word has loaded, check if the same spelling exists elsewhere.
  // Re-runs if the reviewer renames the word so stale hits don't linger.
  useEffect(() => {
    const spelling = formData.word.trim();
    if (!spelling || status !== "authenticated") {
      setDuplicates([]);
      return;
    }
    const controller = new AbortController();
    (async () => {
      const params = new URLSearchParams({
        word: spelling,
        excludeId: resolvedParams.id,
      });
      const res = await fetch(`/api/words/duplicates?${params}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setDuplicates(data.duplicates || []);
      }
    })().catch(() => {
      // Ignore cancellation or network errors; duplicates are a hint, not a gate.
    });
    return () => controller.abort();
  }, [formData.word, resolvedParams.id, status]);

  // Soft-lock lifecycle: acquire the lease on mount, heartbeat every
  // 60s to keep it alive while this tab is open, release on unmount.
  // `navigator.sendBeacon` makes the release survive page navigation /
  // tab close when the normal fetch would be killed mid-flight.
  useEffect(() => {
    if (status !== "authenticated") return;

    const wordId = resolvedParams.id;
    let cancelled = false;

    const acquire = async () => {
      try {
        const res = await fetch(`/api/words/${wordId}/lease`, {
          method: "POST",
        });
        if (cancelled) return;
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          setLockedBy(data.heldBy || "another reviewer");
        } else if (res.ok) {
          setLockedBy(null);
        }
      } catch {
        // Network blips are non-fatal; the heartbeat will retry.
      }
    };

    acquire();
    const interval = setInterval(acquire, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      // Release so the next reviewer can pick up the word immediately on
      // in-app navigation. If the browser tab is hard-closed this never
      // runs; the lease times out on its own (3 min) — acceptable delay.
      fetch(`/api/words/${wordId}/lease`, { method: "DELETE" }).catch(() => {});
    };
  }, [status, resolvedParams.id]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const updateData = {
      word: formData.word.toUpperCase(),
      category: formData.category,
      age_group: formData.age_group,
      grade_level: formData.grade_level,
      level: formData.level,
      hints: {
        easy: formData.hints_easy,
        medium: formData.hints_medium,
        hard: formData.hints_hard,
      },
      definition: formData.definition || null,
      example_sentence: formData.example_sentence || null,
      part_of_speech: formData.part_of_speech || null,
      pronunciation: formData.pronunciation || null,
      pronunciation_arpabet: formData.pronunciation_arpabet || null,
      pronunciation_respelling: formData.pronunciation_respelling || null,
      heart_word_explanation: formData.heart_word_explanation || null,
      // Optimistic concurrency token — if the server moved past this
      // version, it returns 409 instead of overwriting.
      version,
    };

    const response = await fetch(`/api/words/${resolvedParams.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    });

    if (response.status === 409) {
      const data = await response.json().catch(() => ({}));
      setSaveConflict({
        currentVersion:
          typeof data.currentVersion === "number" ? data.currentVersion : version,
      });
    } else if (!response.ok) {
      setError("Failed to save changes");
    } else {
      setSuccess("Changes saved successfully");
      setSaveConflict(null);
      fetchWord();
    }

    setIsSaving(false);
  };

  // Hard delete — for unambiguous mistakes (duplicate rows for the same
  // spelling at the same grade, junk seeds). Two-step: typed-confirm prompt
  // followed by the actual DELETE. Decline is the right choice for "this
  // word doesn't belong" since it preserves the audit trail; this is for
  // "this row shouldn't exist at all".
  const handleDelete = async () => {
    if (!word) return;
    const typed = await dlg.prompt({
      title: `Delete ${word.word}?`,
      message:
        "This permanently removes the word and its activity history. Use Decline instead if you want to keep an audit trail. Type the word to confirm.",
      placeholder: word.word,
      okLabel: "Delete permanently",
      validate: (v) =>
        v.trim().toUpperCase() === word.word.toUpperCase() ? null : "Doesn't match",
    });
    if (typed === null) return;
    const res = await fetch(`/api/words/${resolvedParams.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push(backHref);
    } else {
      const data = await res.json().catch(() => ({}));
      await dlg.alert({
        title: "Couldn't delete this word",
        message: data.error ?? "Please try again.",
        tone: "error",
      });
    }
  };

  const handleUndecline = async () => {
    const res = await fetch(`/api/words/${resolvedParams.id}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declined: false }),
    });
    if (res.ok) {
      setSuccess("Word restored to pending");
      await fetchWord();
    } else {
      setError("Couldn't un-decline this word");
    }
  };

  // Discard local edits and reload the server's latest copy. Used by the
  // conflict banner "Reload" action.
  const handleDiscardAndReload = () => {
    setSaveConflict(null);
    setError(null);
    fetchWord();
  };

  // Keep the current edits but bump our version token to the server's
  // latest so the next save goes through. Used when the reviewer has
  // reviewed the remote changes and wants to proceed with their edit anyway.
  const handleForceSave = () => {
    if (saveConflict) {
      setVersion(saveConflict.currentVersion);
      setSaveConflict(null);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="card p-12 text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">Loading word...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!word) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="card p-12 text-center">
            <p className="text-[var(--text-secondary)]">Word not found</p>
            <Link href={backHref} className="btn btn-primary mt-4">
              {backLabel}
            </Link>
          </div>
        </main>
      </div>
    );
  }

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
              {word.word}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {word.declined ? (
                <span className="badge badge-error">Declined</span>
              ) : word.verified ? (
                <span className="badge badge-success">Verified</span>
              ) : (
                <span className="badge badge-warning">Pending</span>
              )}
              <button
                type="button"
                onClick={() => setShowReview(true)}
                className="badge badge-neutral hover:bg-[var(--bg-secondary)] cursor-pointer"
                title="Open the review card view for this word"
              >
                👁 Show review view
              </button>
              {(() => {
                const a = worldForCategory(word.category);
                return a.world ? (
                  <span
                    className="badge badge-neutral"
                    title={`${a.world.tagline}\n\n${a.world.description}`}
                  >
                    {a.world.emoji} {a.world.name}
                  </span>
                ) : (
                  <span className="badge badge-warning" title={a.note}>
                    ⚠ World: Mixed
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        {duplicates.length > 0 && (() => {
          // Split declined out so reviewers don't mistake a declined ghost
          // for a live duplicate they need to reconcile.
          const live = duplicates.filter((d) => !d.declined);
          const declinedDupes = duplicates.filter((d) => d.declined);
          return (
            <div className="bg-[var(--warning-bg)] border border-[var(--warning)] px-4 py-3 rounded-lg mb-6 text-sm">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="font-medium text-[var(--warning)]">
                  {live.length > 0
                    ? "This spelling already exists elsewhere"
                    : "Other copies of this spelling exist (all declined)"}
                </div>
                {live.length > 0 && (
                  <Link
                    href={`/words/group/${encodeURIComponent(formData.word)}?from=${from ?? "words"}`}
                    className="btn btn-secondary text-xs whitespace-nowrap"
                  >
                    Edit all variants together →
                  </Link>
                )}
              </div>
              <ul className="space-y-1 text-[var(--text-primary)]">
                {[...live, ...declinedDupes].map((d) => {
                  const dWorld = worldForCategory(d.category).world;
                  return (
                    <li
                      key={d.id}
                      className={`flex items-center gap-2 ${d.declined ? "opacity-60" : ""}`}
                    >
                      <Link
                        href={`/words/${d.id}?from=${from ?? "words"}`}
                        className={`underline hover:no-underline ${d.declined ? "line-through" : ""}`}
                      >
                        {d.word}
                      </Link>
                      <span className="text-[var(--text-secondary)]">
                        · {d.gradeLevel ? GRADE_LEVEL_LABEL[d.gradeLevel] : "ungraded"} · level {d.level}
                        {dWorld ? ` · ${dWorld.emoji} ${dWorld.name}` : ""}
                      </span>
                      {d.declined ? (
                        <span
                          className="badge badge-error"
                          title="Declined — hidden from review and not re-added on import"
                        >
                          Declined
                        </span>
                      ) : d.verified ? (
                        <span className="badge badge-success">Verified</span>
                      ) : (
                        <span className="badge badge-warning">Pending</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {live.length > 0 ? (
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  Use <span className="font-medium">Edit all variants together</span> to keep shared fields (definition, pronunciation, etc.) in sync across age groups.
                </p>
              ) : (
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  Declined copies are hidden from the review queue and won&apos;t be re-added on imports. No action needed.
                </p>
              )}
            </div>
          );
        })()}

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

        {lockedBy && (
          <div className="bg-[var(--warning-bg)] text-[var(--text-primary)] border border-[var(--warning)] px-4 py-3 rounded-lg mb-6 text-sm">
            <span className="font-medium text-[var(--warning)]">
              {lockedBy} is editing this word right now.
            </span>{" "}
            You can view it but saving is blocked until their lease expires or they
            navigate away.
          </div>
        )}

        {word.declined && (
          <div className="flex items-start justify-between gap-3 bg-[var(--error-bg)] text-[var(--text-primary)] border border-[var(--error)] px-4 py-3 rounded-lg mb-6 text-sm">
            <div>
              <div className="font-medium text-[var(--error)] mb-1">
                This word is declined
              </div>
              <p className="text-[var(--text-secondary)]">
                It&apos;s hidden from the review queue and won&apos;t be re-added on
                future imports. Un-decline to put it back into the pending pool.
              </p>
            </div>
            <button
              type="button"
              onClick={handleUndecline}
              className="btn btn-secondary text-xs whitespace-nowrap"
            >
              Un-decline
            </button>
          </div>
        )}

        {saveConflict && (
          <div className="bg-[var(--warning-bg)] text-[var(--text-primary)] border border-[var(--warning)] px-4 py-3 rounded-lg mb-6 text-sm">
            <div className="font-medium text-[var(--warning)] mb-2">
              Someone else saved changes to this word while you were editing.
            </div>
            <p className="text-[var(--text-secondary)] mb-3">
              To avoid overwriting their work, pick one:
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDiscardAndReload}
                className="btn btn-secondary text-sm"
              >
                Discard my changes · reload theirs
              </button>
              <button
                type="button"
                onClick={handleForceSave}
                className="btn btn-secondary text-sm"
              >
                Keep my changes · overwrite on next save
              </button>
            </div>
          </div>
        )}

        <div>
          {/* Main form */}
          <div className="space-y-6">
            {/* Basic info */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Word
                  </label>
                  <input
                    type="text"
                    value={formData.word}
                    onChange={(e) =>
                      setFormData({ ...formData, word: e.target.value.toUpperCase() })
                    }
                    className="input uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    World
                  </label>
                  <select
                    value={worldForCategory(formData.category).world?.id ?? ""}
                    onChange={(e) => {
                      const newWorldId = e.target.value as WorldId;
                      // For sight, preserve heart_words if it was already set;
                      // otherwise default to the first category for that world.
                      const currentIsHeart = formData.category === "heart_words";
                      const nextCategory =
                        newWorldId === "sight" && currentIsHeart
                          ? "heart_words"
                          : (CATEGORIES_BY_WORLD[newWorldId]?.[0] ?? formData.category);
                      setFormData({ ...formData, category: nextCategory });
                    }}
                    className="input"
                  >
                    {Object.values(WORLDS).map((w) => (
                      <option key={w.id} value={w.id} title={w.description}>
                        {w.emoji} {w.name}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const selected = worldForCategory(formData.category).world;
                    return selected ? (
                      <p className="text-xs mt-1 text-[var(--text-secondary)] leading-relaxed">
                        <span className="font-medium text-[var(--text-primary)]">
                          {selected.tagline}.
                        </span>{" "}
                        {selected.description}
                      </p>
                    ) : null;
                  })()}
                  {worldForCategory(formData.category).world?.id === "sight" && (
                    <label className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.category === "heart_words"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
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
                    Grade
                  </label>
                  <select
                    value={formData.grade_level}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        grade_level: e.target.value as GradeLevel,
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
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Level
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        level: parseInt(e.target.value) as Level,
                      })
                    }
                    className="input"
                  >
                    <option value={1}>Level 1</option>
                    <option value={2}>Level 2</option>
                    <option value={3}>Level 3</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Hints */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Hints</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Easy Hint
                  </label>
                  <input
                    type="text"
                    value={formData.hints_easy}
                    onChange={(e) =>
                      setFormData({ ...formData, hints_easy: e.target.value })
                    }
                    className="input"
                    placeholder="Direct, visual or sensory description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Medium Hint
                  </label>
                  <input
                    type="text"
                    value={formData.hints_medium}
                    onChange={(e) =>
                      setFormData({ ...formData, hints_medium: e.target.value })
                    }
                    className="input"
                    placeholder="Moderately helpful, gives context"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Hard Hint
                  </label>
                  <input
                    type="text"
                    value={formData.hints_hard}
                    onChange={(e) =>
                      setFormData({ ...formData, hints_hard: e.target.value })
                    }
                    className="input"
                    placeholder="Subtle, indirect references"
                  />
                </div>
              </div>
            </div>

            {/* Educational metadata */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Educational Metadata</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Definition
                  </label>
                  <textarea
                    value={formData.definition}
                    onChange={(e) =>
                      setFormData({ ...formData, definition: e.target.value })
                    }
                    className="input"
                    rows={2}
                    placeholder="Simple, age-appropriate definition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Example Sentence
                  </label>
                  <input
                    type="text"
                    value={formData.example_sentence}
                    onChange={(e) =>
                      setFormData({ ...formData, example_sentence: e.target.value })
                    }
                    className="input"
                    placeholder="A sentence using the word"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Part of Speech
                  </label>
                  <input
                    type="text"
                    value={formData.part_of_speech}
                    onChange={(e) =>
                      setFormData({ ...formData, part_of_speech: e.target.value })
                    }
                    className="input"
                    placeholder="noun, verb, adjective..."
                  />
                </div>

                {/* Pronunciation: three coordinated fields. Respelling is what
                    kids see in the iOS UI; IPA is the curator-facing source of
                    truth; ARPAbet is the CMUdict intermediate. See PRONUNCIATION.md. */}
                <div className="border-t border-[var(--border-light)] pt-4">
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Pronunciation
                    </h3>
                    <span className="text-xs text-[var(--text-secondary)]">
                      Respelling is shown to kids in-game
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        Respelling (kid display)
                      </label>
                      <input
                        type="text"
                        value={formData.pronunciation_respelling}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            pronunciation_respelling: e.target.value,
                          })
                        }
                        className="input"
                        placeholder="ARD-vark"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        IPA (source of truth)
                      </label>
                      <input
                        type="text"
                        value={formData.pronunciation}
                        onChange={(e) =>
                          setFormData({ ...formData, pronunciation: e.target.value })
                        }
                        className="input"
                        placeholder="/ˈɑːrdvɑːrk/"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        ARPAbet (CMUdict)
                      </label>
                      <input
                        type="text"
                        value={formData.pronunciation_arpabet}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            pronunciation_arpabet: e.target.value,
                          })
                        }
                        className="input font-mono text-xs"
                        placeholder="AA1 R D V AA2 R K"
                      />
                    </div>
                  </div>
                </div>
                {formData.category === "heart_words" && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                      Heart Word Explanation
                    </label>
                    <textarea
                      value={formData.heart_word_explanation}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          heart_word_explanation: e.target.value,
                        })
                      }
                      className="input"
                      rows={2}
                      placeholder="Why this word is a heart word"
                    />
                  </div>
                )}
              </div>
            </div>

            <ImageGeneratePanel wordId={resolvedParams.id} />

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={isSaving || !!lockedBy}
              title={lockedBy ? `${lockedBy} is editing this word` : undefined}
              className="btn btn-success w-full"
            >
              {isSaving ? (
                <>
                  <span className="spinner" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>

            {/* Delete (hard) — for unambiguous mistakes only. Decline is the
                better choice for "this word doesn't belong" since it preserves
                the audit trail and survives re-imports. */}
            <button
              onClick={handleDelete}
              disabled={!!lockedBy}
              title={lockedBy ? `${lockedBy} is editing this word` : "Permanently delete this word"}
              className="btn btn-danger text-sm"
            >
              Delete word permanently
            </button>

            {/* Activity History */}
            <div className="card">
              <button
                onClick={() => setActivityExpanded(!activityExpanded)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <h2 className="text-lg font-semibold">
                  Activity History ({activity.length})
                </h2>
                <span className="text-[var(--text-secondary)]">
                  {activityExpanded ? "▲" : "▼"}
                </span>
              </button>
              {activityExpanded && (
                <div className="border-t border-[var(--border-light)]">
                  {activity.length === 0 ? (
                    <p className="p-4 text-sm text-[var(--text-secondary)]">
                      No activity recorded yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--border-light)]">
                      {activity.map((entry) => (
                        <div key={entry.id} className="p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span
                              className={`badge ${
                                entry.action === "verified"
                                  ? "badge-success"
                                  : entry.action === "rejected"
                                    ? "badge-error"
                                    : entry.action === "created"
                                      ? "badge-info"
                                      : "badge-neutral"
                              }`}
                            >
                              {entry.action}
                            </span>
                            <span className="text-sm text-[var(--text-secondary)]">
                              {entry.user_email || "Unknown user"}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] ml-auto">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          {entry.details && (entry.details as { changes?: Record<string, { old: unknown; new: unknown }> }).changes && (
                            <div className="mt-2 text-sm bg-[var(--bg-secondary)] rounded p-3 space-y-1">
                              {Object.entries((entry.details as { changes: Record<string, { old: unknown; new: unknown }> }).changes).map(
                                ([field, change]) => (
                                  <div key={field} className="flex flex-wrap gap-2">
                                    <span className="font-medium text-[var(--text-primary)]">
                                      {field.replace(/_/g, " ")}:
                                    </span>
                                    <span className="text-[var(--error)] line-through">
                                      {typeof change.old === "object"
                                        ? JSON.stringify(change.old)
                                        : String(change.old || "(empty)")}
                                    </span>
                                    <span className="text-[var(--text-secondary)]">→</span>
                                    <span className="text-[var(--success)]">
                                      {typeof change.new === "object"
                                        ? JSON.stringify(change.new)
                                        : String(change.new || "(empty)")}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                          {entry.action === "flagged" && entry.details && (
                            <FlagDetails details={entry.details} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
      {showReview && word && (
        <WordReviewModal
          word={word}
          onClose={() => setShowReview(false)}
          onWordChange={(updated) => setWord(updated)}
        />
      )}
    </div>
  );
}

// Renders the details payload of a "flagged" activity_log row. Handles both
// shapes: new = { reasons: string[], note?: string }, legacy = { reason: string }.
function FlagDetails({ details }: { details: unknown }) {
  if (!details || typeof details !== "object") return null;
  const d = details as {
    reasons?: unknown;
    note?: unknown;
    reason?: unknown;
  };
  const REASON_LABELS: Record<string, string> = {
    image: "Picture",
    word_details: "Word details",
  };
  const reasons = Array.isArray(d.reasons)
    ? d.reasons.filter((r): r is string => typeof r === "string")
    : [];
  const note =
    typeof d.note === "string" && d.note.trim().length > 0
      ? d.note.trim()
      : typeof d.reason === "string" && d.reason.trim().length > 0
        ? d.reason.trim()
        : null;
  if (reasons.length === 0 && !note) return null;
  return (
    <div className="mt-2 text-sm bg-[var(--bg-secondary)] rounded p-3 space-y-2">
      {reasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            Flagged:
          </span>
          {reasons.map((r) => (
            <span key={r} className="badge badge-warning">
              {REASON_LABELS[r] ?? r}
            </span>
          ))}
        </div>
      )}
      {note && (
        <div className="text-[var(--text-primary)] whitespace-pre-wrap">
          {note}
        </div>
      )}
    </div>
  );
}
