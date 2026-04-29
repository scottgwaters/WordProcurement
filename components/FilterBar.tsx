"use client";

import type { GradeLevel, Level, WordFilters } from "@/lib/types";
import { GRADE_LEVELS, GRADE_LEVEL_LABEL } from "@/lib/types";
import { WORLDS } from "@/lib/worlds";

interface FilterBarProps {
  filters: WordFilters & { world?: string };
  onChange: (filters: WordFilters & { world?: string }) => void;
  showStatus?: boolean; // hide verified/pending selector when parent page forces it
  /** Render a standalone "Flagged only" toggle. Used on the review page
   *  where the status selector is hidden (verified is forced) but we still
   *  want reviewers to narrow down to the flagged queue. */
  showFlaggedToggle?: boolean;
}

const LEVELS: Level[] = [1, 2, 3];

export default function FilterBar({
  filters,
  onChange,
  showStatus = true,
  showFlaggedToggle = false,
}: FilterBarProps) {
  const hasAny =
    filters.search ||
    filters.world ||
    filters.gradeLevel ||
    filters.ungraded ||
    filters.level ||
    filters.verified !== undefined ||
    filters.flagged !== undefined ||
    filters.declined !== undefined;

  const selectCls =
    "h-9 px-2 pr-7 text-sm rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]";

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <input
        type="text"
        placeholder="Search…"
        value={filters.search || ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
        className="h-9 px-3 text-sm rounded-md border border-[var(--border)] bg-[var(--bg-primary)] min-w-[160px] flex-1"
        aria-label="Search words"
      />

      <select
        value={filters.world || ""}
        onChange={(e) => onChange({ ...filters, world: e.target.value || undefined })}
        className={selectCls}
        aria-label="Filter by world"
        title={
          filters.world
            ? `${WORLDS[filters.world as keyof typeof WORLDS]?.tagline}. ${WORLDS[filters.world as keyof typeof WORLDS]?.description}`
            : "Filter words by in-game world"
        }
      >
        <option value="">All worlds</option>
        {Object.values(WORLDS).map((w) => (
          <option key={w.id} value={w.id} title={w.description}>
            {w.emoji} {w.name}
          </option>
        ))}
      </select>

      <select
        value={filters.ungraded ? "__ungraded__" : (filters.gradeLevel || "")}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__ungraded__") {
            onChange({ ...filters, ungraded: true, gradeLevel: undefined });
          } else if (v) {
            onChange({ ...filters, gradeLevel: v as GradeLevel, ungraded: undefined });
          } else {
            onChange({ ...filters, gradeLevel: undefined, ungraded: undefined });
          }
        }}
        className={selectCls}
        aria-label="Filter by grade level"
      >
        <option value="">All grades</option>
        {GRADE_LEVELS.map((g) => (
          <option key={g} value={g}>{GRADE_LEVEL_LABEL[g]}</option>
        ))}
        <option value="__ungraded__">Ungraded</option>
      </select>

      <select
        value={filters.level?.toString() || ""}
        onChange={(e) =>
          onChange({ ...filters, level: e.target.value ? (parseInt(e.target.value) as Level) : undefined })
        }
        className={selectCls}
        aria-label="Filter by level"
      >
        <option value="">All levels</option>
        {LEVELS.map((l) => (
          <option key={l} value={l}>L{l}</option>
        ))}
      </select>

      {showStatus && (
        <select
          value={
            filters.declined
              ? "declined"
              : filters.flagged
                ? "flagged"
                : filters.verified === undefined
                  ? ""
                  : filters.verified
                    ? "verified"
                    : "pending"
          }
          onChange={(e) => {
            const v = e.target.value;
            // These options are mutually exclusive in the UI.
            if (v === "declined") {
              onChange({
                ...filters,
                declined: true,
                verified: undefined,
                flagged: undefined,
              });
            } else if (v === "flagged") {
              onChange({ ...filters, flagged: true, verified: undefined, declined: undefined });
            } else if (v === "verified") {
              onChange({ ...filters, verified: true, flagged: undefined, declined: undefined });
            } else if (v === "pending") {
              onChange({ ...filters, verified: false, flagged: undefined, declined: undefined });
            } else {
              onChange({
                ...filters,
                verified: undefined,
                flagged: undefined,
                declined: undefined,
              });
            }
          }}
          className={selectCls}
          aria-label="Filter by verification status"
        >
          <option value="">All status</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="flagged">Flagged</option>
          <option value="declined">Declined</option>
        </select>
      )}

      {showFlaggedToggle && (
        <label
          className={`inline-flex items-center gap-2 h-9 px-3 text-sm rounded-md border cursor-pointer select-none ${
            filters.flagged
              ? "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning)] font-medium"
              : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
          }`}
        >
          <input
            type="checkbox"
            checked={filters.flagged ?? false}
            onChange={(e) =>
              onChange({ ...filters, flagged: e.target.checked ? true : undefined })
            }
            className="accent-[var(--warning)]"
          />
          ⚑ Flagged only
        </label>
      )}

      {hasAny && (
        <button
          onClick={() => onChange({})}
          className="h-9 px-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Clear
        </button>
      )}
    </div>
  );
}
