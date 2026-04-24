import type { AgeGroup } from "@/lib/types";

// Age-bucket pill. Emoji + range only (no "Ages" prefix) so reviewers can
// recognize the bucket at a glance without reading the digits. The visible
// range remains the accessible label; the emoji is decorative.
const AGE_PRESETS: Record<
  AgeGroup,
  { emoji: string; label: string; className: string }
> = {
  "4-6":   { emoji: "🐣", label: "4–6",   className: "badge-age-46" },
  "7-9":   { emoji: "🧒", label: "7–9",   className: "badge-age-79" },
  "10-12": { emoji: "🎓", label: "10–12", className: "badge-age-1012" },
};

export default function AgeBadge({ value }: { value: AgeGroup }) {
  const preset = AGE_PRESETS[value];
  return (
    <span className={`badge ${preset.className}`}>
      <span aria-hidden="true">{preset.emoji}</span> {preset.label}
    </span>
  );
}
