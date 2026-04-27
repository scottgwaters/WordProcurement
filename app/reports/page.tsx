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

function emptyMatrix(): Record<AgeGroup, Record<Level, Counts>> {
  return {
    "4-6":   { 1: { total: 0, verified: 0 }, 2: { total: 0, verified: 0 }, 3: { total: 0, verified: 0 } },
    "7-9":   { 1: { total: 0, verified: 0 }, 2: { total: 0, verified: 0 }, 3: { total: 0, verified: 0 } },
    "10-12": { 1: { total: 0, verified: 0 }, 2: { total: 0, verified: 0 }, 3: { total: 0, verified: 0 } },
  };
}

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // One groupBy over (category, ageGroup, level) gives us every cell of every
  // world's matrix in a single round-trip. Categories are folded into worlds
  // client-side using CATEGORIES_BY_WORLD so the UI stays in sync with the
  // game's mapping (the source of truth lives in lib/worlds.ts).
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

  const byWorld: Record<WorldId, Record<AgeGroup, Record<Level, Counts>>> = {
    animals: emptyMatrix(), food: emptyMatrix(), nature: emptyMatrix(),
    space: emptyMatrix(), objects: emptyMatrix(), magic: emptyMatrix(),
    sight: emptyMatrix(), feelings: emptyMatrix(),
  };

  const accumulate = (rows: typeof allCells, key: keyof Counts) => {
    rows.forEach((row) => {
      const worldId = WORLD_BY_CATEGORY[row.category];
      if (!worldId) return; // unknown category — surfaces in dashboard only
      const ag = row.ageGroup as AgeGroup;
      const lvl = row.level as Level;
      if (!byWorld[worldId][ag]?.[lvl]) return;
      byWorld[worldId][ag][lvl][key] += row._count._all;
    });
  };
  accumulate(allCells, "total");
  accumulate(verifiedCells, "verified");

  const worldTotals: Record<WorldId, Counts> = {} as Record<WorldId, Counts>;
  WORLD_ORDER.forEach((worldId) => {
    let total = 0, verified = 0;
    AGE_GROUPS.forEach((ag) => LEVELS.forEach((lvl) => {
      total += byWorld[worldId][ag][lvl].total;
      verified += byWorld[worldId][ag][lvl].verified;
    }));
    worldTotals[worldId] = { total, verified };
  });

  const sortedWorlds = [...WORLD_ORDER].sort(
    (a, b) => worldTotals[b].total - worldTotals[a].total,
  );

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
            Words by World
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Word counts broken out by world, age group, and difficulty level.
            Each cell shows total / verified and links to the filtered word list.
          </p>
        </div>

        <div className="space-y-8">
          {sortedWorlds.map((worldId) => {
            const world = WORLDS[worldId];
            const matrix = byWorld[worldId];
            const totals = worldTotals[worldId];
            return (
              <section key={worldId} className="card p-6">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <span>{world.emoji}</span>
                    <span>{world.name}</span>
                  </h2>
                  <Link
                    href={`/words?world=${worldId}`}
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
                        <th className="w-32">Age Group</th>
                        {LEVELS.map((lvl) => (
                          <th key={lvl} className="text-right">Level {lvl}</th>
                        ))}
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {AGE_GROUPS.map((ag) => {
                        const rowTotal = LEVELS.reduce(
                          (s, l) => s + matrix[ag][l].total, 0,
                        );
                        const rowVerified = LEVELS.reduce(
                          (s, l) => s + matrix[ag][l].verified, 0,
                        );
                        return (
                          <tr key={ag}>
                            <td>
                              <AgeChip ageGroup={ag} />
                            </td>
                            {LEVELS.map((lvl) => {
                              const c = matrix[ag][lvl];
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
                          const colTotal = AGE_GROUPS.reduce(
                            (s, ag) => s + matrix[ag][lvl].total, 0,
                          );
                          const colVerified = AGE_GROUPS.reduce(
                            (s, ag) => s + matrix[ag][lvl].verified, 0,
                          );
                          return (
                            <td key={lvl} className="text-right">
                              <ReportCell
                                counts={{ total: colTotal, verified: colVerified }}
                                href={`/words?world=${worldId}&level=${lvl}`}
                                strong
                              />
                            </td>
                          );
                        })}
                        <td className="text-right">
                          <ReportCell
                            counts={totals}
                            href={`/words?world=${worldId}`}
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
