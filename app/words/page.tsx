"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import FilterBar from "@/components/FilterBar";
import Link from "next/link";
import type { Word, WordFilters } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { worldForCategory } from "@/lib/worlds";

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
  const pageSize = 50;

  const router = useRouter();
  const { status } = useSession();

  const fetchWords = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (filters.world) params.set("world", filters.world);
    if (filters.ageGroup) params.set("ageGroup", filters.ageGroup);
    if (filters.level) params.set("level", String(filters.level));
    if (filters.verified !== undefined) params.set("verified", String(filters.verified));
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
  }, [status, filters, page]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchWords();
    }
  }, [status, fetchWords, router]);

  useEffect(() => {
    setPage(0);
  }, [filters]);

  const totalPages = Math.ceil(totalCount / pageSize);

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
          <div className="text-sm text-[var(--text-secondary)]">
            {totalCount.toLocaleString()} words
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
                    <th>Age Group</th>
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
                        <span className="font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                          {word.word}
                        </span>
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
                        <span className="badge badge-neutral">{word.age_group}</span>
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
                          ) : word.verified ? (
                            <span className="badge badge-success">Verified</span>
                          ) : (
                            <span className="badge badge-warning">Pending</span>
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
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
    </div>
  );
}
