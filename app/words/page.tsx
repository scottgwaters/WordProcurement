"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import FilterBar from "@/components/FilterBar";
import Link from "next/link";
import type { Word, WordFilters } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function WordsPage() {
  const [words, setWords] = useState<Word[]>([]);
  const [filters, setFilters] = useState<WordFilters & { world?: string }>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    else if (filters.category) params.set("category", filters.category);
    if (filters.ageGroup) params.set("ageGroup", filters.ageGroup);
    if (filters.level) params.set("level", String(filters.level));
    if (filters.verified !== undefined) params.set("verified", String(filters.verified));
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

        {(() => {
          const activeCount = [
            filters.search, filters.world, filters.category, filters.ageGroup,
            filters.level, filters.verified !== undefined ? "verified" : null,
          ].filter(Boolean).length;
          return (
            <div>
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                aria-controls="words-filters"
                className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
              >
                <span aria-hidden>{filtersOpen ? "▾" : "▸"}</span>
                Filters
                {activeCount > 0 && (
                  <span className="badge badge-neutral">{activeCount}</span>
                )}
              </button>
              {filtersOpen && (
                <div id="words-filters" className="mt-2">
                  <FilterBar filters={filters} onChange={setFilters} />
                </div>
              )}
            </div>
          );
        })()}

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
                    <th>Category</th>
                    <th>Age Group</th>
                    <th>Level</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((word) => (
                    <tr key={word.id}>
                      <td>
                        <span className="font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                          {word.word}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-[var(--text-secondary)]">
                          {word.category.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-neutral">{word.age_group}</span>
                      </td>
                      <td>
                        <span className="text-sm">{word.level}</span>
                      </td>
                      <td>
                        {word.verified ? (
                          <span className="badge badge-success">Verified</span>
                        ) : (
                          <span className="badge badge-warning">Pending</span>
                        )}
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
                  ))}
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
