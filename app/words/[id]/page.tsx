"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import HintGenerator from "@/components/HintGenerator";
import type { Word, GeneratedHints, AgeGroup, Level, ActivityLogWithUser } from "@/lib/types";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CATEGORIES } from "@/lib/types";

export default function WordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [word, setWord] = useState<Word | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityLogWithUser[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);

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
    source: "",
  });

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
      source: data.source || "",
    });

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
      source: formData.source || null,
    };

    const response = await fetch(`/api/words/${resolvedParams.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      setError("Failed to save changes");
    } else {
      setSuccess("Changes saved successfully");
      fetchWord();
    }

    setIsSaving(false);
  };

  const handleHintsSave = async (hints: GeneratedHints) => {
    setFormData((prev) => ({
      ...prev,
      hints_easy: hints.hints.easy,
      hints_medium: hints.hints.medium,
      hints_hard: hints.hints.hard,
      definition: hints.definition,
      example_sentence: hints.example_sentence,
      part_of_speech: hints.part_of_speech,
    }));

    // Auto-save after generating hints
    setIsSaving(true);

    const updateData = {
      hints: hints.hints,
      definition: hints.definition,
      example_sentence: hints.example_sentence,
      part_of_speech: hints.part_of_speech,
    };

    const response = await fetch(`/api/words/${resolvedParams.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      setError("Failed to save hints");
    } else {
      setSuccess("AI-generated hints saved successfully");
      fetchWord();
    }

    setIsSaving(false);
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
            <Link href="/words" className="btn btn-primary mt-4">
              Back to Words
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
            href="/words"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ← Back
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="md:col-span-2 space-y-6">
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
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="input"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, " ")}
                      </option>
                    ))}
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
              <div className="mt-4">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Source
                </label>
                <input
                  type="text"
                  value={formData.source}
                  onChange={(e) =>
                    setFormData({ ...formData, source: e.target.value })
                  }
                  className="input"
                  placeholder="Where this word came from (e.g., Dolch list, Fry words)"
                />
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
              disabled={isSaving}
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

          {/* AI Hint Generator sidebar */}
          <div>
            <HintGenerator word={word} onSave={handleHintsSave} />
          </div>
        </div>
      </main>
    </div>
  );
}
