"use client";

import { useEffect, useState } from "react";
import type { AgeGroup, Level, WordFilters } from "@/lib/types";

interface FilterBarProps {
  filters: WordFilters;
  onChange: (filters: WordFilters) => void;
}

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const [categories, setCategories] = useState<string[]>([]);
  const ageGroups: AgeGroup[] = ["4-6", "7-9", "10-12"];
  const levels: Level[] = [1, 2, 3];

  useEffect(() => {
    async function fetchCategories() {
      const response = await fetch("/api/words/categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    }
    fetchCategories();
  }, []);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search words..."
            value={filters.search || ""}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="input"
          />
        </div>

        {/* Category */}
        <select
          value={filters.category || ""}
          onChange={(e) =>
            onChange({ ...filters, category: e.target.value || undefined })
          }
          className="input w-auto"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        {/* Age group */}
        <select
          value={filters.ageGroup || ""}
          onChange={(e) =>
            onChange({
              ...filters,
              ageGroup: (e.target.value as AgeGroup) || undefined,
            })
          }
          className="input w-auto"
        >
          <option value="">All ages</option>
          {ageGroups.map((age) => (
            <option key={age} value={age}>
              Ages {age}
            </option>
          ))}
        </select>

        {/* Level */}
        <select
          value={filters.level?.toString() || ""}
          onChange={(e) =>
            onChange({
              ...filters,
              level: e.target.value ? (parseInt(e.target.value) as Level) : undefined,
            })
          }
          className="input w-auto"
        >
          <option value="">All levels</option>
          {levels.map((level) => (
            <option key={level} value={level}>
              Level {level}
            </option>
          ))}
        </select>

        {/* Verification status */}
        <select
          value={
            filters.verified === undefined
              ? ""
              : filters.verified
                ? "verified"
                : "pending"
          }
          onChange={(e) =>
            onChange({
              ...filters,
              verified:
                e.target.value === ""
                  ? undefined
                  : e.target.value === "verified",
            })
          }
          className="input w-auto"
        >
          <option value="">All status</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
        </select>

        {/* Clear filters */}
        {(filters.search ||
          filters.category ||
          filters.ageGroup ||
          filters.level ||
          filters.verified !== undefined) && (
          <button
            onClick={() => onChange({})}
            className="btn btn-secondary text-sm"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
