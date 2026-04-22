"use client";

import type { AgeGroup, Level, WordFilters } from "@/lib/types";
import { WORLDS } from "@/lib/worlds";

interface FilterBarProps {
  filters: WordFilters & { world?: string };
  onChange: (filters: WordFilters & { world?: string }) => void;
  showStatus?: boolean; // hide verified/pending selector when parent page forces it
}

const AGE_GROUPS: AgeGroup[] = ["4-6", "7-9", "10-12"];
const LEVELS: Level[] = [1, 2, 3];

export default function FilterBar({ filters, onChange, showStatus = true }: FilterBarProps) {
  const hasAny =
    filters.search ||
    filters.category ||
    filters.world ||
    filters.ageGroup ||
    filters.level ||
    filters.verified !== undefined;

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
        onChange={(e) => onChange({ ...filters, world: e.target.value || undefined, category: undefined })}
        className={selectCls}
        aria-label="Filter by world"
      >
        <option value="">All worlds</option>
        {Object.values(WORLDS).map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>

      <select
        value={filters.ageGroup || ""}
        onChange={(e) =>
          onChange({ ...filters, ageGroup: (e.target.value as AgeGroup) || undefined })
        }
        className={selectCls}
        aria-label="Filter by age group"
      >
        <option value="">All ages</option>
        {AGE_GROUPS.map((a) => (
          <option key={a} value={a}>Ages {a}</option>
        ))}
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
          value={filters.verified === undefined ? "" : filters.verified ? "verified" : "pending"}
          onChange={(e) =>
            onChange({
              ...filters,
              verified: e.target.value === "" ? undefined : e.target.value === "verified",
            })
          }
          className={selectCls}
          aria-label="Filter by verification status"
        >
          <option value="">All status</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
        </select>
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
