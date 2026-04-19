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
  const [filters, setFilters] = useState<WordFilters>({ verified: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, remaining: 0 });

  const router = useRouter();
  const { status } = useSession();

  const fetchWords = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);

    const params = new URLSearchParams();
    params.set("verified", "false");
    params.set("pageSize", "50");
    if (filters.category) params.set("category", filters.category);
    if (filters.ageGroup) params.set("ageGroup", filters.ageGroup);
    if (filters.level) params.set("level", String(filters.level));
    if (filters.search) params.set("search", filters.search);

    const response = await fetch(`/api/words?${params.toString()}`);
    if (response.ok) {
      const data = await response.json();
      setWords(data.words || []);
      setCurrentIndex(0);
    }

    // Get stats
    const statsResponse = await fetch("/api/words/stats");
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      setStats({
        reviewed: statsData.verifiedWords || 0,
        remaining: statsData.unverifiedWords || 0,
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
        reviewed: prev.reviewed + 1,
        remaining: prev.remaining - 1,
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

  const currentWord = words[currentIndex];

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
        <div className="flex items-center justify-between mb-6">
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

        <FilterBar
          filters={filters}
          onChange={(newFilters) => setFilters({ ...newFilters, verified: false })}
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
