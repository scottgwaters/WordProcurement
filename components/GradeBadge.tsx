import type { GradeLevel } from "@/lib/types";

const GRADE_PRESETS: Record<
  GradeLevel,
  { emoji: string; label: string; className: string }
> = {
  prek: { emoji: "🍼", label: "Pre-K", className: "badge-grade-prek" },
  k:    { emoji: "🐣", label: "K",     className: "badge-grade-k" },
  "1":  { emoji: "1️⃣", label: "1st",  className: "badge-grade-1" },
  "2":  { emoji: "2️⃣", label: "2nd",  className: "badge-grade-2" },
  "3":  { emoji: "3️⃣", label: "3rd",  className: "badge-grade-3" },
  "4":  { emoji: "4️⃣", label: "4th",  className: "badge-grade-4" },
};

export default function GradeBadge({ value }: { value: GradeLevel | null | undefined }) {
  if (!value) {
    return (
      <span className="badge badge-warning" title="No grade level assigned yet">
        ⚠ Ungraded
      </span>
    );
  }
  const preset = GRADE_PRESETS[value];
  if (!preset) {
    return (
      <span className="badge badge-warning" title={`Unknown grade: ${value}`}>
        ⚠ {value}
      </span>
    );
  }
  return (
    <span className={`badge ${preset.className}`}>
      <span aria-hidden="true">{preset.emoji}</span> {preset.label}
    </span>
  );
}
