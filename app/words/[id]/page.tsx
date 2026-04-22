"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import type { Word, AgeGroup, Level, ActivityLogWithUser } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CATEGORIES } from "@/lib/types";
import { worldForCategory, WORLDS, CATEGORIES_BY_WORLD, type WorldId } from "@/lib/worlds";

export default function WordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = from === "review" ? "/review" : "/words";
  const backLabel = from === "review" ? "Back to review" : "Back to words";
  const [word, setWord] = useState<Word | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityLogWithUser[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
  // Cross-tier duplicates for this word's spelling (case-insensitive).
  // Populated after the word loads so the reviewer can spot e.g. "DRAGON
  // already lives in 10-12 / magic" before verifying a new copy.
  type Duplicate = {
    id: string;
    word: string;
    ageGroup: AgeGroup;
    level: Level;
    category: string;
    verified: boolean;
  };
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  // Per-world word counts for the current age group, shown inline on each
  // option in the World dropdown so the curator can see how full each
  // world is before (re)assigning.
  const [worldCounts, setWorldCounts] = useState<Record<WorldId, number> | null>(null);
  // Controls the "Why this world?" popover next to the world badge.
  const [showWhyWorld, setShowWhyWorld] = useState(false);
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
    level: 1 as Level,
    hints_easy: "",
    hints_medium: "",
    hints_hard: "",
    definition: "",
    example_sentence: "",
    part_of_speech: "",
    pronunciation: "",
    heart_word_explanation: "",
  });
  // Version token read from the server on load; echoed on PATCH so the
  // server can reject our write if someone else saved first.
  const [version, setVersion] = useState<number>(0);

  const router = useRouter();
  const { status } = useSession();

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
      level: data.level,
      hints_easy: data.hints?.easy || "",
      hints_medium: data.hints?.medium || "",
      hints_hard: data.hints?.hard || "",
      definition: data.definition || "",
      example_sentence: data.example_sentence || "",
      part_of_speech: data.part_of_speech || "",
      pronunciation: data.pronunciation || "",
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

  // Load per-world counts for this word's age group so the World dropdown
  // can show "Animal Kingdom · 47 at 7-9" style hints. Re-fetches when the
  // age group changes.
  useEffect(() => {
    if (status !== "authenticated" || !formData.age_group) return;
    const controller = new AbortController();
    (async () => {
      const params = new URLSearchParams({
        ageGroup: formData.age_group,
        byWorld: "1",
      });
      const res = await fetch(`/api/words/stats?${params}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.countsByWorld) setWorldCounts(data.countsByWorld);
      }
    })().catch(() => {
      // Counts are decorative; silent on errors.
    });
    return () => controller.abort();
  }, [formData.age_group, status]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const updateData = {
      word: formData.word.toUpperCase(),
      category: formData.category,
      age_group: formData.age_group,
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
              {word.verified ? (
                <span className="badge badge-success">Verified</span>
              ) : (
                <span className="badge badge-warning">Pending</span>
              )}
              <span className="text-sm text-[var(--text-secondary)]">
                {word.category.replace(/_/g, " ")}
              </span>
              {(() => {
                const a = worldForCategory(word.category);
                const siblings = a.world
                  ? CATEGORIES_BY_WORLD[a.world.id].filter((c) => c !== word.category)
                  : [];
                return (
                  <span className="relative inline-flex items-center gap-1">
                    {a.world ? (
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
                    )}
                    <button
                      type="button"
                      onClick={() => setShowWhyWorld((v) => !v)}
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[var(--border)] text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                      aria-label="Why this world?"
                      aria-expanded={showWhyWorld}
                    >
                      ?
                    </button>
                    {showWhyWorld && (
                      <div
                        role="tooltip"
                        className="absolute left-0 top-full mt-1 z-10 w-72 p-3 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg text-xs leading-relaxed text-[var(--text-primary)]"
                      >
                        <div className="mb-2">
                          <span className="font-medium">Category</span>{" "}
                          <code className="px-1 py-0.5 rounded bg-[var(--bg-secondary)]">
                            {word.category}
                          </code>{" "}
                          →{" "}
                          {a.world ? (
                            <>
                              <span>
                                {a.world.emoji} {a.world.name}
                              </span>
                            </>
                          ) : (
                            <span className="text-[var(--warning)]">ambiguous</span>
                          )}
                        </div>
                        {a.world && (
                          <div className="mb-2 text-[var(--text-secondary)]">
                            {a.world.description}
                          </div>
                        )}
                        {siblings.length > 0 && (
                          <div className="text-[var(--text-secondary)]">
                            Other categories mapped to{" "}
                            <span className="font-medium">{a.world?.name}</span>:{" "}
                            {siblings.map((c) => c.replace(/_/g, " ")).join(", ")}
                          </div>
                        )}
                        {a.note && !a.world && (
                          <div className="text-[var(--warning)]">{a.note}</div>
                        )}
                      </div>
                    )}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        {duplicates.length > 0 && (
          <div className="bg-[var(--warning-bg)] border border-[var(--warning)] px-4 py-3 rounded-lg mb-6 text-sm">
            <div className="font-medium text-[var(--warning)] mb-2">
              This spelling already exists elsewhere
            </div>
            <ul className="space-y-1 text-[var(--text-primary)]">
              {duplicates.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <Link
                    href={`/words/${d.id}?from=${from ?? "words"}`}
                    className="underline hover:no-underline"
                  >
                    {d.word}
                  </Link>
                  <span className="text-[var(--text-secondary)]">
                    · ages {d.ageGroup} · level {d.level} ·{" "}
                    {d.category.replace(/_/g, " ")}
                  </span>
                  {d.verified ? (
                    <span className="badge badge-success">Verified</span>
                  ) : (
                    <span className="badge badge-warning">Pending</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

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
                      const defaultCategory = CATEGORIES_BY_WORLD[newWorldId]?.[0];
                      if (defaultCategory) {
                        setFormData({ ...formData, category: defaultCategory });
                      }
                    }}
                    className="input"
                  >
                    {Object.values(WORLDS).map((w) => {
                      const count = worldCounts?.[w.id];
                      const suffix =
                        count !== undefined
                          ? ` · ${count} at ${formData.age_group}`
                          : "";
                      return (
                        <option
                          key={w.id}
                          value={w.id}
                          title={w.description}
                        >
                          {w.emoji} {w.name}
                          {suffix}
                        </option>
                      );
                    })}
                  </select>
                  {(() => {
                    // Show the full description of the currently-selected world
                    // so the reviewer has concrete examples of what belongs
                    // there without having to hover a tooltip.
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
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Category <span className="text-[var(--text-tertiary)] font-normal">(fine-grained)</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="input"
                  >
                    {Object.values(WORLDS).map((w) => (
                      <optgroup key={w.id} label={`${w.emoji} ${w.name}`}>
                        {CATEGORIES_BY_WORLD[w.id]
                          .filter((c) => (CATEGORIES as readonly string[]).includes(c))
                          .map((cat) => (
                            <option key={cat} value={cat}>
                              {cat.replace(/_/g, " ")}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                    {/* Any categories not yet mapped to a world */}
                    <optgroup label="⚠ Unmapped">
                      {CATEGORIES.filter(
                        (c) => !Object.values(CATEGORIES_BY_WORLD).flat().includes(c)
                      ).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.replace(/_/g, " ")}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Age Group
                  </label>
                  <select
                    value={formData.age_group}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        age_group: e.target.value as AgeGroup,
                      })
                    }
                    className="input"
                  >
                    <option value="4-6">Ages 4-6</option>
                    <option value="7-9">Ages 7-9</option>
                    <option value="10-12">Ages 10-12</option>
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
                <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                      Pronunciation
                    </label>
                    <input
                      type="text"
                      value={formData.pronunciation}
                      onChange={(e) =>
                        setFormData({ ...formData, pronunciation: e.target.value })
                      }
                      className="input"
                      placeholder="Phonetic spelling"
                    />
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

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={isSaving || !!lockedBy}
              title={lockedBy ? `${lockedBy} is editing this word` : undefined}
              className="btn btn-primary w-full"
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
    </div>
  );
}
