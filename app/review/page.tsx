"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/Header";
import WordCard from "@/components/WordCard";
import FilterBar from "@/components/FilterBar";
import { useDialog } from "@/components/Dialog";
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

  // Refs mirror the active word so fetchWords can preserve position on a
  // background refetch without putting words/currentIndex in its deps
  // (which would loop the mount effect).
  const wordsRef = useRef<Word[]>([]);
  const currentIndexRef = useRef(0);
  useEffect(() => {
    wordsRef.current = words;
    currentIndexRef.current = currentIndex;
  }, [words, currentIndex]);

  const router = useRouter();
  const { status } = useSession();
  const dlg = useDialog();

  const fetchWords = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (status !== "authenticated") return;

      // Silent mode skips the spinner flash on background/poll refreshes.
      // Only the initial load and filter-change refetches should show the
      // loading state.
      const silent = opts?.silent ?? false;
      if (!silent) setIsLoading(true);

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
      if (filters.flagged) params.set("flagged", "true");
      if (filters.search) params.set("search", filters.search);

      // Anchor by the current word's id so a background refetch doesn't
      // dump the reviewer back to word 1.
      const anchorId = wordsRef.current[currentIndexRef.current]?.id;

      const response = await fetch(`/api/words?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        const serverWords: Word[] = data.words || [];

        if (silent) {
          // Merge: keep words the reviewer has already acted on this
          // session (so Previous can still navigate back to them), keep
          // local pending rows still in the server response, and append
          // any newly-pending words the server returned.
          const localActed = wordsRef.current.filter(
            (w) => w.verified || w.declined
          );
          const actedIds = new Set(localActed.map((w) => w.id));
          const serverIds = new Set(serverWords.map((w) => w.id));
          const localPending = wordsRef.current.filter(
            (w) => !w.verified && !w.declined && serverIds.has(w.id)
          );
          const localIds = new Set(
            [...localActed, ...localPending].map((w) => w.id)
          );
          const newFromServer = serverWords.filter(
            (w) => !localIds.has(w.id) && !actedIds.has(w.id)
          );
          const merged = [...localActed, ...localPending, ...newFromServer];
          setWords(merged);

          if (anchorId) {
            const idx = merged.findIndex((w) => w.id === anchorId);
            if (idx >= 0) setCurrentIndex(idx);
          }
        } else {
          // Fresh load or filter-change: take server ordering as truth.
          setWords(serverWords);
          if (anchorId) {
            const idx = serverWords.findIndex((w) => w.id === anchorId);
            setCurrentIndex(
              idx >= 0
                ? idx
                : Math.min(
                    currentIndexRef.current,
                    Math.max(0, serverWords.length - 1)
                  )
            );
          } else {
            setCurrentIndex(0);
          }
        }
      }

      // Stats — include today's count so the progress bar can show momentum.
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

      if (!silent) setIsLoading(false);
    },
    [status, filters]
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchWords();
    }
  }, [status, fetchWords, router]);

  // Keep the queue fresh: another reviewer may have approved/rejected
  // words since this tab loaded. Refetch when the tab regains focus and
  // once a minute while active — silently, so the word card doesn't flash
  // a spinner under the reviewer.
  useEffect(() => {
    if (status !== "authenticated") return;
    const refresh = () => {
      if (!isActing && document.visibilityState === "visible") {
        fetchWords({ silent: true });
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [status, isActing, fetchWords]);

  // Advance to the next pending word (skipping any words the reviewer has
  // already acted on in this session). Falls through to the literal next
  // index if there's nothing pending ahead, so Previous still works.
  const advanceToNextPending = () => {
    const list = wordsRef.current;
    const cursor = currentIndexRef.current;
    for (let i = cursor + 1; i < list.length; i++) {
      if (!list[i].verified && !list[i].declined) {
        setCurrentIndex(i);
        return;
      }
    }
    // No pending left ahead — just land on the next index so the reviewer
    // sees the "acted on" state of what they just decided.
    setCurrentIndex(Math.min(cursor + 1, list.length - 1));
  };

  const handleVerify = async (wordId: string) => {
    setIsActing(true);
    const current = words.find((w) => w.id === wordId);
    const wasPending = !!current && !current.verified && !current.declined;
    const wasDeclined = !!current?.declined;

    const response = await fetch(`/api/words/${wordId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: true }),
    });

    if (response.ok) {
      // Mark in place — don't shrink the list, so Previous can land on it.
      setWords((prev) =>
        prev.map((w) =>
          w.id === wordId ? { ...w, verified: true, declined: false } : w
        )
      );
      // Stats delta depends on the previous state:
      //   pending  → verified: reviewed +1, remaining -1
      //   declined → verified: reviewed +1 (no remaining change since declined was already out of the pending pool)
      //   approved → approved: no change
      setStats((prev) => {
        if (wasPending) {
          return {
            ...prev,
            reviewed: prev.reviewed + 1,
            remaining: Math.max(0, prev.remaining - 1),
            verifiedToday: prev.verifiedToday + 1,
          };
        }
        if (wasDeclined) {
          return {
            ...prev,
            reviewed: prev.reviewed + 1,
            total: prev.total + 1, // re-entering the active pool
            verifiedToday: prev.verifiedToday + 1,
          };
        }
        return prev;
      });
      advanceToNextPending();
    }

    setIsActing(false);
  };

  const handleReject = async (wordId: string) => {
    setIsActing(true);
    const current = words.find((w) => w.id === wordId);
    const wasPending = !!current && !current.verified && !current.declined;
    const wasVerified = !!current?.verified;

    await fetch(`/api/words/${wordId}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declined: true }),
    });

    // Mark in place — don't shrink the list, so Previous can land on it.
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId ? { ...w, declined: true, verified: false } : w
      )
    );
    setStats((prev) => {
      if (wasPending) {
        return {
          ...prev,
          remaining: Math.max(0, prev.remaining - 1),
          total: Math.max(0, prev.total - 1), // declined rows drop out of total
        };
      }
      if (wasVerified) {
        return {
          ...prev,
          reviewed: Math.max(0, prev.reviewed - 1),
          total: Math.max(0, prev.total - 1),
          verifiedToday: Math.max(0, prev.verifiedToday - 1),
        };
      }
      return prev;
    });
    advanceToNextPending();

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
    const word = words.find((w) => w.id === wordId);
    const alreadyFlagged = word?.flagged ?? false;

    // Toggle: if the word is already flagged, clicking the (now active)
    // Flag button un-flags it. Otherwise we prompt for an optional note
    // and mark it flagged.
    if (alreadyFlagged) {
      setIsActing(true);
      await fetch(`/api/words/${wordId}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: false }),
      });
      setWords((prev) =>
        prev.map((w) => (w.id === wordId ? { ...w, flagged: false } : w))
      );
      setIsActing(false);
      return;
    }

    const reason = await dlg.prompt({
      title: "Flag for another reviewer",
      message: "What should they look at? Leave blank if you don't need to say.",
      placeholder: "Optional note",
      multiline: true,
      okLabel: "Flag word",
    });
    if (reason === null) return; // cancelled
    setIsActing(true);
    await fetch(`/api/words/${wordId}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged: true, reason: reason || undefined }),
    });
    // Reflect flagged state locally so the button shows active immediately.
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, flagged: true } : w))
    );
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

      const key = e.key.toLowerCase();
      if (!currentWord || isActing) return;

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
            <ShortcutsHelp />
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

        <FilterBar
          filters={filters}
          onChange={(newFilters) => setFilters({ ...newFilters, verified: false })}
          showStatus={false}
          showFlaggedToggle
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
                  {(() => {
                    const pending = words.filter(
                      (w) => !w.verified && !w.declined
                    ).length;
                    return pending !== words.length ? (
                      <>
                        {" "}
                        · <span className="font-medium">{pending}</span> still
                        pending
                      </>
                    ) : null;
                  })()}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                    disabled={currentIndex === 0}
                    className="btn btn-secondary text-sm"
                  >
                    Previous
                    <kbd
                      aria-hidden
                      className="ml-1 px-1 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono text-[10px] leading-none"
                    >
                      K
                    </kbd>
                  </button>
                  <button
                    onClick={() =>
                      setCurrentIndex(Math.min(words.length - 1, currentIndex + 1))
                    }
                    disabled={currentIndex === words.length - 1}
                    className="btn btn-secondary text-sm"
                  >
                    Next
                    <kbd
                      aria-hidden
                      className="ml-1 px-1 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono text-[10px] leading-none"
                    >
                      J
                    </kbd>
                  </button>
                </div>
              </div>

              {currentWord && (
                <WordCard
                  word={currentWord}
                  showActions
                  showShortcuts
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

// Small ?-icon in the header that reveals the full list of keyboard
// shortcuts on hover or focus. Keeps the info discoverable without a full
// ribbon of text at the top of the page.
function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const shortcuts: Array<[string, string]> = [
    ["A", "Approve"],
    ["D", "Decline"],
    ["E", "Edit word"],
    ["F", "Flag for review"],
    ["S", "Skip"],
    ["J", "Next word"],
    ["K", "Previous word"],
  ];
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
        </svg>
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-full mt-2 z-10 w-56 p-3 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg text-xs"
        >
          <div className="font-semibold text-[var(--text-primary)] mb-2">
            Keyboard shortcuts
          </div>
          <ul className="space-y-1.5">
            {shortcuts.map(([key, label]) => (
              <li
                key={key}
                className="flex items-center justify-between text-[var(--text-secondary)]"
              >
                <span>{label}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-primary)] font-mono text-[10px]">
                  {key}
                </kbd>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
