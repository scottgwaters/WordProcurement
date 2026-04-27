import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Header from "@/components/Header";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WORLDS, CATEGORIES_BY_WORLD, type WorldId } from "@/lib/worlds";
import type { AgeGroup, Level } from "@/lib/types";

const AGE_GROUPS: AgeGroup[] = ["4-6", "7-9", "10-12"];
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

  // One groupBy over (category, ageGroup, level) gives us every cell of every
  // age group's matrix in a single round-trip. Categories are folded into
  // worlds client-side using CATEGORIES_BY_WORLD so the UI stays in sync with
  // the game's mapping (the source of truth lives in lib/worlds.ts).
  const [allCells, verifiedCells] = await Promise.all([
    prisma.word.groupBy({
      by: ["category", "ageGroup", "level"],
      _count: { _all: true },
      where: { declined: false },
    }),
    prisma.word.groupBy({
      by: ["category", "ageGroup", "level"],
      _count: { _all: true },
      where: { declined: false, verified: true },
    }),
  ]);

  const byAge: Record<AgeGroup, Record<WorldId, Record<Level, Counts>>> = {
    "4-6":   emptyWorldMatrix(),
    "7-9":   emptyWorldMatrix(),
    "10-12": emptyWorldMatrix(),
  };

  const accumulate = (rows: typeof allCells, key: keyof Counts) => {
    rows.forEach((row) => {
      const worldId = WORLD_BY_CATEGORY[row.category];
      if (!worldId) return; // unknown category — surfaces in dashboard only
      const ag = row.ageGroup as AgeGroup;
      const lvl = row.level as Level;
      if (!byAge[ag]?.[worldId]?.[lvl]) return;
      byAge[ag][worldId][lvl][key] += row._count._all;
    });
  };
  accumulate(allCells, "total");
  accumulate(verifiedCells, "verified");

  const ageTotals: Record<AgeGroup, Counts> = {} as Record<AgeGroup, Counts>;
  AGE_GROUPS.forEach((ag) => {
    let total = 0, verified = 0;
    WORLD_ORDER.forEach((w) => LEVELS.forEach((l) => {
      total += byAge[ag][w][l].total;
      verified += byAge[ag][w][l].verified;
    }));
    ageTotals[ag] = { total, verified };
  });

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
            Words by Age Group & World
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            For each age group, word counts broken out by world and difficulty
            level. Each cell shows total / verified and links to the filtered
            word list.
          </p>
        </div>

        <div className="space-y-8">
          {AGE_GROUPS.map((ag) => {
            const matrix = byAge[ag];
            const totals = ageTotals[ag];
            // Sort worlds by count within this age group so the heaviest
            // buckets sit on top of each table — easier to scan progress.
            const sortedWorlds = [...WORLD_ORDER].sort((a, b) => {
              const aSum = LEVELS.reduce((s, l) => s + matrix[a][l].total, 0);
              const bSum = LEVELS.reduce((s, l) => s + matrix[b][l].total, 0);
              return bSum - aSum;
            });
            return (
              <section key={ag} className="card p-6">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-3">
                    <AgeChip ageGroup={ag} />
                    <span>Ages {ag}</span>
                  </h2>
                  <Link
                    href={`/words?ageGroup=${ag}`}
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
                                    href={`/words?world=${worldId}&ageGroup=${ag}&level=${lvl}`}
                                  />
                                </td>
                              );
                            })}
                            <td className="text-right">
                              <ReportCell
                                counts={{ total: rowTotal, verified: rowVerified }}
                                href={`/words?world=${worldId}&ageGroup=${ag}`}
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
                          return (
                            <td key={lvl} className="text-right">
                              <ReportCell
                                counts={{ total: colTotal, verified: colVerified }}
                                href={`/words?ageGroup=${ag}&level=${lvl}`}
                                strong
                              />
                            </td>
                          );
                        })}
                        <td className="text-right">
                          <ReportCell
                            counts={totals}
                            href={`/words?ageGroup=${ag}`}
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

function AgeChip({ ageGroup }: { ageGroup: AgeGroup }) {
  const cls =
    ageGroup === "4-6" ? "badge-age-46"
    : ageGroup === "7-9" ? "badge-age-79"
    : "badge-age-1012";
  return <span className={`badge ${cls}`}>{ageGroup}</span>;
}
