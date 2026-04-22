"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import WordCard from "@/components/WordCard";
import FilterBar from "@/components/FilterBar";
import type { Word, WordFilters } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function ReviewPage() {
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filters, setFilters] = useState<WordFilters & { world?: string }>({ verified: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [stats, setStats] = useState({
    reviewed: 0,
    remaining: 0,
    total: 0,
    verifiedToday: 0,
  });

  const router = useRouter();
  const { status } = useSession();

  const fetchWords = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);

    const params = new URLSearchParams();
    params.set("verified", "false");
    params.set("pageSize", "50");
    // Skip words another reviewer is actively editing so two people don't
    // land on the same pending word.
    params.set("excludeLeased", "1");
    if (filters.world) params.set("world", filters.world);
    else if (filters.category) params.set("category", filters.category);
    if (filters.ageGroup) params.set("ageGroup", filters.ageGroup);
    if (filters.level) params.set("level", String(filters.level));
    if (filters.search) params.set("search", filters.search);

    const response = await fetch(`/api/words?${params.toString()}`);
    if (response.ok) {
      const data = await response.json();
      setWords(data.words || []);
      setCurrentIndex(0);
    }

    // Get stats — include today's count so the progress bar can show momentum.
    const statsResponse = await fetch("/api/words/stats?today=1");
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      setStats({
        reviewed: statsData.verifiedWords || 0,
        remaining: statsData.unverifiedWords || 0,
        total: statsData.totalWords || 0,
        verifiedToday: statsData.verifiedToday || 0,
      });
    }

    setIsLoading(false);
  }, [status, filters]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchWords();
    }
  }, [status, fetchWords, router]);

  const handleVerify = async (wordId: string) => {
    setIsActing(true);

    const response = await fetch(`/api/words/${wordId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: true }),
    });

    if (response.ok) {
      setWords((prev) => prev.filter((w) => w.id !== wordId));
      setStats((prev) => ({
        ...prev,
        reviewed: prev.reviewed + 1,
        remaining: prev.remaining - 1,
        verifiedToday: prev.verifiedToday + 1,
      }));
    }

    setIsActing(false);
  };

  const handleReject = async (wordId: string) => {
    setIsActing(true);

    await fetch(`/api/words/${wordId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: false }),
    });

    setWords((prev) => prev.filter((w) => w.id !== wordId));
    setStats((prev) => ({
      ...prev,
      remaining: prev.remaining - 1,
    }));

    setIsActing(false);
  };

  const handleSkip = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else if (words.length > 0) {
      setCurrentIndex(0);
    }
  };

  const handleEdit = (wordId: string) => {
    router.push(`/words/${wordId}?from=review`);
  };

  const handleFlag = async (wordId: string) => {
    const reason = window.prompt(
      "Flag this word for another reviewer. Add an optional note:"
    );
    if (reason === null) return; // cancelled
    setIsActing(true);
    await fetch(`/api/words/${wordId}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged: true, reason: reason || undefined }),
    });
    // Move past the flagged word to the next one so reviewer can keep moving
    if (currentIndex < words.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
    setIsActing(false);
  };

  const currentWord = words[currentIndex];

  // Keyboard shortcuts — let power users blow through the queue without
  // reaching for the mouse. Ignored while a modal prompt is up (handleFlag
  // uses window.prompt) or while focus is in an input/textarea so typing
  // still works if a form is ever embedded on this page.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      if (!currentWord || isActing) return;

      const key = e.key.toLowerCase();
      if (key === "a") {
        e.preventDefault();
        handleVerify(currentWord.id);
      } else if (key === "d") {
        e.preventDefault();
        handleReject(currentWord.id);
      } else if (key === "e") {
        e.preventDefault();
        handleEdit(currentWord.id);
      } else if (key === "f") {
        e.preventDefault();
        handleFlag(currentWord.id);
      } else if (key === "s") {
        e.preventDefault();
        handleSkip();
      } else if (key === "j" || e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(words.length - 1, i + 1));
      } else if (key === "k" || e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentWord, isActing, words.length]);

  if (status === "loading") {
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

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
              Review Queue
            </h1>
            <p className="text-[var(--text-secondary)] mt-1">
              Approve or reject words for the game
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-semibold text-[var(--success)]">
                {stats.reviewed}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">Reviewed</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold text-[var(--warning)]">
                {stats.remaining}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">Remaining</div>
            </div>
          </div>
        </div>

        {/* Overall progress — a thin bar gives the reviewer a finish-line
            signal, and the "X today" number nudges daily momentum. */}
        {stats.total > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span>
                {stats.reviewed} / {stats.total} verified overall
              </span>
              <span>
                {stats.verifiedToday} verified today
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--border-light)] overflow-hidden">
              <div
                className="h-full bg-[var(--success)] transition-all"
                style={{
                  width: `${Math.round((stats.reviewed / stats.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Keyboard shortcut hint — discoverable but unobtrusive. */}
        <div className="text-xs text-[var(--text-secondary)] mb-4" aria-hidden>
          <span className="font-medium">Shortcuts:</span>{" "}
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-secondary)]">A</kbd>{" "}
          approve ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-secondary)]">D</kbd>{" "}
          decline ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-secondary)]">E</kbd>{" "}
          edit ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-secondary)]">F</kbd>{" "}
          flag ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-secondary)]">S</kbd>{" "}
          skip ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-secondary)]">J</kbd>/
          <kbd className="px-1 py-0.5 rounded bg-[var(--bg-secondary)]">K</kbd>{" "}
          next/prev
        </div>

        <FilterBar
          filters={filters}
          onChange={(newFilters) => setFilters({ ...newFilters, verified: false })}
          showStatus={false}
        />

        <div className="mt-6">
          {isLoading ? (
            <div className="card p-12 text-center">
              <div className="spinner mx-auto mb-4" />
              <p className="text-[var(--text-secondary)]">Loading words...</p>
            </div>
          ) : words.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="text-4xl mb-4">🎉</div>
              <h2 className="text-xl font-semibold mb-2">All caught up!</h2>
              <p className="text-[var(--text-secondary)]">
                No words pending review with current filters.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[var(--text-secondary)]">
                  Word {currentIndex + 1} of {words.length}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                    disabled={currentIndex === 0}
                    className="btn btn-secondary text-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      setCurrentIndex(Math.min(words.length - 1, currentIndex + 1))
                    }
                    disabled={currentIndex === words.length - 1}
                    className="btn btn-secondary text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>

              {currentWord && (
                <WordCard
                  word={currentWord}
                  showActions
                  onVerify={handleVerify}
                  onReject={handleReject}
                  onEdit={handleEdit}
                  onFlag={handleFlag}
                  onSkip={handleSkip}
                  isLoading={isActing}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
