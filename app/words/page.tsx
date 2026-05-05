"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import FilterBar from "@/components/FilterBar";
import Link from "next/link";
import type { Word, WordFilters } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { worldForCategory } from "@/lib/worlds";
import GradeBadge from "@/components/GradeBadge";
import WordReviewModal from "@/components/WordReviewModal";

// useSearchParams requires a Suspense boundary during prerender;
// the outer default export provides one.
export default function WordsPage() {
  return (
    <Suspense fallback={null}>
      <WordsPageInner />
    </Suspense>
  );
}

function WordsPageInner() {
  const searchParams = useSearchParams();
  const [words, setWords] = useState<Word[]>([]);
  // Seed from URL so dashboard deep-links (e.g. /words?world=feelings) land
  // pre-filtered. Initial state reads the query string once; subsequent
  // filter changes update local state but are not re-synced to the URL.
  const [filters, setFilters] = useState<WordFilters & { world?: string }>(() => ({
    world: searchParams.get("world") || undefined,
  }));
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [modalWord, setModalWord] = useState<Word | null>(null);
  const [pageSize, setPageSize] = useState<number | "all">(50);
  const pageSizeOptions: (number | "all")[] = [25, 50, 100, 200, 500, "all"];

  const router = useRouter();
  const { status } = useSession();

  const fetchWords = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (filters.world) params.set("world", filters.world);
    if (filters.gradeLevel) params.set("gradeLevel", filters.gradeLevel);
    if (filters.ungraded) params.set("ungraded", "true");
    if (filters.level) params.set("level", String(filters.level));
    if (filters.verified !== undefined) params.set("verified", String(filters.verified));
    if (filters.audioVerified !== undefined) params.set("audioVerified", String(filters.audioVerified));
    if (filters.flagged) params.set("flagged", "true");
    if (filters.declined) params.set("declined", "true");
    if (filters.search) params.set("search", filters.search);

    const response = await fetch(`/api/words?${params.toString()}`);
    if (response.ok) {
      const data = await response.json();
      setWords(data.words || []);
      setTotalCount(data.total || 0);
    }

    setIsLoading(false);
  }, [status, filters, page, pageSize]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchWords();
    }
  }, [status, fetchWords, router]);

  useEffect(() => {
    setPage(0);
  }, [filters, pageSize]);

  const totalPages = pageSize === "all" ? 1 : Math.ceil(totalCount / pageSize);

  if (status === "loading") {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-7xl mx-auto px-6 py-8">
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

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
              Words
            </h1>
            <p className="text-[var(--text-secondary)] mt-1">
              Browse and manage all words in the database
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
            <span>{totalCount.toLocaleString()} words</span>
            <label htmlFor="pageSize" className="flex items-center gap-2">
              Show
              <select
                id="pageSize"
                value={String(pageSize)}
                onChange={(e) => {
                  const v = e.target.value;
                  setPageSize(v === "all" ? "all" : Number(v));
                }}
                className="input text-sm py-1 px-2"
              >
                {pageSizeOptions.map((size) => (
                  <option key={String(size)} value={String(size)}>
                    {size === "all" ? "All" : size}
                  </option>
                ))}
              </select>
              per page
            </label>
          </div>
        </div>

        <FilterBar filters={filters} onChange={setFilters} />

        <div className="mt-6">
          {isLoading ? (
            <div className="card p-12 text-center">
              <div className="spinner mx-auto mb-4" />
              <p className="text-[var(--text-secondary)]">Loading words...</p>
            </div>
          ) : words.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-[var(--text-secondary)]">
                No words found with current filters.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th>Word</th>
                    <th>World</th>
                    <th>Grade</th>
                    <th>Level</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((word) => {
                    const world = worldForCategory(word.category).world;
                    return (
                    <tr key={word.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setModalWord(word)}
                          className="font-semibold text-[var(--text-primary)] uppercase tracking-wide hover:text-[var(--accent)] transition-fast cursor-pointer"
                        >
                          {word.word}
                        </button>
                      </td>
                      <td>
                        {world ? (
                          <span className="text-sm text-[var(--text-secondary)]">
                            {world.emoji} {world.name}
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--warning)]">Unmapped</span>
                        )}
                      </td>
                      <td>
                        <GradeBadge value={word.grade_level} />
                      </td>
                      <td>
                        <span className="text-sm">{word.level}</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          {word.declined ? (
                            <span
                              className="badge badge-error"
                              title="Declined — hidden from the review queue"
                            >
                              Declined
                            </span>
                          ) : (
                            <>
                              <span
                                className={word.verified ? "badge badge-success" : "badge badge-warning"}
                                title={word.verified ? "Text content reviewed" : "Text content pending review"}
                              >
                                {word.verified ? "Text ✓" : "Text"}
                              </span>
                              <span
                                className={word.audio_verified ? "badge badge-success" : "badge badge-warning"}
                                title={word.audio_verified ? "Audio clip reviewed" : "Audio clip pending review"}
                              >
                                {word.audio_verified ? "Audio ✓" : "Audio"}
                              </span>
                            </>
                          )}
                          {word.flagged && (
                            <span
                              className="badge badge-warning"
                              title="Flagged for another reviewer"
                            >
                              ⚑ Flagged
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <Link
                          href={`/words/${word.id}`}
                          className="text-sm text-[var(--accent)] hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalCount > 0 && totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
              <div className="text-sm text-[var(--text-secondary)]">
                Page {page + 1} of {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="btn btn-secondary text-sm"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn btn-secondary text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
      {modalWord && (
        <WordReviewModal
          word={modalWord}
          onClose={() => setModalWord(null)}
          onWordChange={(updated) => {
            setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
            setModalWord(updated);
          }}
        />
      )}
    </div>
  );
}
