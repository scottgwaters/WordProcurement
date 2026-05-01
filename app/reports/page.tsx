import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Header from "@/components/Header";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WORLDS, CATEGORIES_BY_WORLD, type WorldId } from "@/lib/worlds";
import type { GradeLevel, Level } from "@/lib/types";
import { GRADE_LEVELS, GRADE_LEVEL_LABEL } from "@/lib/types";
import GradeBadge from "@/components/GradeBadge";

const LEVELS: Level[] = [1, 2, 3];
const WORLD_ORDER: WorldId[] = [
  "animals", "food", "nature", "space", "objects", "magic", "sight", "feelings",
];

// Reverse CATEGORIES_BY_WORLD so we can roll up category groupBy results.
const WORLD_BY_CATEGORY: Record<string, WorldId> = {};
(Object.keys(CATEGORIES_BY_WORLD) as WorldId[]).forEach((worldId) => {
  CATEGORIES_BY_WORLD[worldId].forEach((cat) => {
    WORLD_BY_CATEGORY[cat] = worldId;
  });
});

type Counts = { total: number; verified: number };

// Rows include the six grades plus an "ungraded" bucket so reviewers can
// see what hasn't been graded yet. Once the corpus is fully graded the
// ungraded row has a zero total and is hidden in the render.
type GradeRow = GradeLevel | "ungraded";
const GRADE_ROWS: GradeRow[] = [...GRADE_LEVELS, "ungraded"];

function emptyWorldMatrix(): Record<WorldId, Record<Level, Counts>> {
  const out = {} as Record<WorldId, Record<Level, Counts>>;
  WORLD_ORDER.forEach((w) => {
    out[w] = {
      1: { total: 0, verified: 0 },
      2: { total: 0, verified: 0 },
      3: { total: 0, verified: 0 },
    };
  });
  return out;
}

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // One groupBy over (category, gradeLevel, level) gives us every cell of
  // every grade's matrix in a single round-trip. Categories are folded into
  // worlds client-side using CATEGORIES_BY_WORLD so the UI stays in sync
  // with the game's mapping (the source of truth lives in lib/worlds.ts).
  const [allCells, verifiedCells] = await Promise.all([
    prisma.word.groupBy({
      by: ["category", "gradeLevel", "level"],
      _count: { _all: true },
      where: { declined: false },
    }),
    prisma.word.groupBy({
      by: ["category", "gradeLevel", "level"],
      _count: { _all: true },
      where: { declined: false, verified: true },
    }),
  ]);

  const byGrade: Record<GradeRow, Record<WorldId, Record<Level, Counts>>> = {
    k: emptyWorldMatrix(),
    "1": emptyWorldMatrix(),
    "2": emptyWorldMatrix(),
    "3": emptyWorldMatrix(),
    "4": emptyWorldMatrix(),
    ungraded: emptyWorldMatrix(),
  };

  const accumulate = (rows: typeof allCells, key: keyof Counts) => {
    rows.forEach((row) => {
      const worldId = WORLD_BY_CATEGORY[row.category];
      if (!worldId) return; // unknown category — surfaces in dashboard only
      const g = (row.gradeLevel ?? "ungraded") as GradeRow;
      const lvl = row.level as Level;
      if (!byGrade[g]?.[worldId]?.[lvl]) return;
      byGrade[g][worldId][lvl][key] += row._count._all;
    });
  };
  accumulate(allCells, "total");
  accumulate(verifiedCells, "verified");

  const gradeTotals: Record<GradeRow, Counts> = {} as Record<GradeRow, Counts>;
  GRADE_ROWS.forEach((g) => {
    let total = 0, verified = 0;
    WORLD_ORDER.forEach((w) => LEVELS.forEach((l) => {
      total += byGrade[g][w][l].total;
      verified += byGrade[g][w][l].verified;
    }));
    gradeTotals[g] = { total, verified };
  });

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
            Words by Grade & World
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            For each grade, word counts broken out by world and difficulty
            level. Each cell shows total / verified and links to the filtered
            word list.
          </p>
        </div>

        <div className="space-y-8">
          {GRADE_ROWS.map((g) => {
            const matrix = byGrade[g];
            const totals = gradeTotals[g];
            // Hide the ungraded row entirely once it's empty — once the
            // corpus is fully graded reviewers don't need a row of dashes.
            if (g === "ungraded" && totals.total === 0) return null;
            // Sort worlds by count within this grade so the heaviest
            // buckets sit on top of each table — easier to scan progress.
            const sortedWorlds = [...WORLD_ORDER].sort((a, b) => {
              const aSum = LEVELS.reduce((s, l) => s + matrix[a][l].total, 0);
              const bSum = LEVELS.reduce((s, l) => s + matrix[b][l].total, 0);
              return bSum - aSum;
            });
            const headerHref =
              g === "ungraded" ? `/words?ungraded=true` : `/words?gradeLevel=${g}`;
            return (
              <section key={g} className="card p-6">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-3">
                    {g === "ungraded" ? (
                      <>
                        <span className="badge badge-warning">⚠ Ungraded</span>
                        <span>Ungraded</span>
                      </>
                    ) : (
                      <>
                        <GradeBadge value={g} />
                        <span>{GRADE_LEVEL_LABEL[g]}</span>
                      </>
                    )}
                  </h2>
                  <Link
                    href={headerHref}
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    {totals.total.toLocaleString()} words
                    {totals.total > 0 && (
                      <span className="ml-2 text-xs">
                        ({totals.verified.toLocaleString()} verified)
                      </span>
                    )}
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>World</th>
                        {LEVELS.map((lvl) => (
                          <th key={lvl} className="text-right">Level {lvl}</th>
                        ))}
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedWorlds.map((worldId) => {
                        const world = WORLDS[worldId];
                        const rowTotal = LEVELS.reduce(
                          (s, l) => s + matrix[worldId][l].total, 0,
                        );
                        const rowVerified = LEVELS.reduce(
                          (s, l) => s + matrix[worldId][l].verified, 0,
                        );
                        const cellGrade =
                          g === "ungraded" ? "ungraded=true" : `gradeLevel=${g}`;
                        return (
                          <tr key={worldId}>
                            <td>
                              <span className="flex items-center gap-2">
                                <span>{world.emoji}</span>
                                <span>{world.name}</span>
                              </span>
                            </td>
                            {LEVELS.map((lvl) => {
                              const c = matrix[worldId][lvl];
                              return (
                                <td key={lvl} className="text-right">
                                  <ReportCell
                                    counts={c}
                                    href={`/words?world=${worldId}&${cellGrade}&level=${lvl}`}
                                  />
                                </td>
                              );
                            })}
                            <td className="text-right">
                              <ReportCell
                                counts={{ total: rowTotal, verified: rowVerified }}
                                href={`/words?world=${worldId}&${cellGrade}`}
                                strong
                              />
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td className="font-medium text-[var(--text-secondary)]">Total</td>
                        {LEVELS.map((lvl) => {
                          const colTotal = WORLD_ORDER.reduce(
                            (s, w) => s + matrix[w][lvl].total, 0,
                          );
                          const colVerified = WORLD_ORDER.reduce(
                            (s, w) => s + matrix[w][lvl].verified, 0,
                          );
                          const cellGrade =
                            g === "ungraded" ? "ungraded=true" : `gradeLevel=${g}`;
                          return (
                            <td key={lvl} className="text-right">
                              <ReportCell
                                counts={{ total: colTotal, verified: colVerified }}
                                href={`/words?${cellGrade}&level=${lvl}`}
                                strong
                              />
                            </td>
                          );
                        })}
                        <td className="text-right">
                          <ReportCell
                            counts={totals}
                            href={headerHref}
                            strong
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function ReportCell({
  counts,
  href,
  strong,
}: {
  counts: Counts;
  href: string;
  strong?: boolean;
}) {
  if (counts.total === 0) {
    return <span className="text-[var(--text-tertiary)]">—</span>;
  }
  return (
    <Link
      href={href}
      className="inline-block text-right hover:text-[var(--accent-hover)]"
    >
      <span className={strong ? "font-semibold" : "font-medium"}>
        {counts.total.toLocaleString()}
      </span>
      <span className="block text-xs text-[var(--text-secondary)]">
        {counts.verified.toLocaleString()} verified
      </span>
    </Link>
  );
}
