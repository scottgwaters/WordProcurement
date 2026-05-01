import Image from "next/image";
import type { GradeLevel } from "@/lib/types";

const GRADE_PRESETS: Record<
  GradeLevel,
  { icon: string; label: string; className: string }
> = {
  k:    { icon: "/grade-icons/bunny.png", label: "K",     className: "grade-pill--k" },
  "1":  { icon: "/grade-icons/fox.png",   label: "1st",   className: "grade-pill--1" },
  "2":  { icon: "/grade-icons/deer.png",  label: "2nd",   className: "grade-pill--2" },
  "3":  { icon: "/grade-icons/owl.png",   label: "3rd",   className: "grade-pill--3" },
  "4":  { icon: "/grade-icons/bear.png",  label: "4th",   className: "grade-pill--4" },
};

export default function GradeBadge({
  value,
  size = "sm",
}: {
  value: GradeLevel | null | undefined;
  size?: "sm" | "md";
}) {
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
  const dim = size === "md" ? 28 : 22;
  return (
    <span className={`grade-pill grade-pill--${size} ${preset.className}`}>
      <Image
        src={preset.icon}
        alt=""
        width={dim}
        height={dim}
        className="grade-pill__icon"
        aria-hidden="true"
      />
      <span className="grade-pill__label">{preset.label}</span>
    </span>
  );
}
