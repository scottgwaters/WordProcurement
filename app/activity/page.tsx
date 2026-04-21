"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Link from "next/link";
import type { ActivityLogWithUser } from "@/lib/types";

interface PaginatedResponse {
  items: ActivityLogWithUser[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

function ActivityContent() {
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const fetchActivity = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (actionFilter) params.set("action", actionFilter);

    const response = await fetch(`/api/activity?${params}`);
    if (response.ok) {
      const result = await response.json();
      setData(result);
    }
    setIsLoading(false);
  }, [page, actionFilter]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchActivity();
    }
  }, [status, fetchActivity, router]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);
    if (page > 1) params.set("page", String(page));
    const newUrl = params.toString() ? `?${params}` : "/activity";
    window.history.replaceState({}, "", newUrl);
  }, [actionFilter, page]);

  // Read filters from URL on mount
  useEffect(() => {
    const action = searchParams.get("action");
    const pageParam = searchParams.get("page");
    if (action) setActionFilter(action);
    if (pageParam) setPage(parseInt(pageParam));
  }, [searchParams]);

  const formatChanges = (details: Record<string, unknown> | null) => {
    if (!details) return null;
    const changes = details.changes as Record<string, { old: unknown; new: unknown }> | undefined;
    if (!changes) return null;
    return Object.entries(changes).map(([field, change]) => (
      <div key={field} className="text-xs">
        <span className="font-medium">{field.replace(/_/g, " ")}</span>
        {": "}
        <span className="text-[var(--error)] line-through">
          {typeof change.old === "object" ? JSON.stringify(change.old) : String(change.old || "(empty)")}
        </span>
        {" → "}
        <span className="text-[var(--success)]">
          {typeof change.new === "object" ? JSON.stringify(change.new) : String(change.new || "(empty)")}
        </span>
      </div>
    ));
  };

  if (status === "loading" || isLoading) {
    return (
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="card p-12 text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">Loading activity...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
            Activity Log
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {data?.pagination.total || 0} total activities
          </p>
        </div>
        <Link href="/" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          ← Dashboard
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Action Type
            </label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="input w-40"
            >
              <option value="">All Actions</option>
              <option value="created">Created</option>
              <option value="edited">Edited</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          {actionFilter && (
            <button
              onClick={() => {
                setActionFilter("");
                setPage(1);
              }}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mt-5"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Activity table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-light)]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Word
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Details
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-light)]">
            {data?.items.map((entry) => (
              <tr key={entry.id} className="hover:bg-[var(--bg-secondary)]">
                <td className="px-4 py-3">
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
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/words/${entry.word_id}`}
                    className="text-[var(--primary)] hover:underline font-medium"
                  >
                    {entry.words?.word || "Unknown"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {entry.user_email || "Unknown"}
                </td>
                <td className="px-4 py-3 max-w-xs">
                  {entry.details && (entry.details as { changes?: unknown }).changes ? (
                    <div className="space-y-0.5">{formatChanges(entry.details as Record<string, unknown>)}</div>
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data?.items.length === 0 && (
          <div className="p-8 text-center text-[var(--text-secondary)]">
            No activity found.
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-secondary"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page >= data.pagination.totalPages}
              className="btn btn-secondary"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ActivityLoading() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="card p-12 text-center">
        <div className="spinner mx-auto mb-4" />
        <p className="text-[var(--text-secondary)]">Loading activity...</p>
      </div>
    </main>
  );
}

export default function ActivityPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <Suspense fallback={<ActivityLoading />}>
        <ActivityContent />
      </Suspense>
    </div>
  );
}
