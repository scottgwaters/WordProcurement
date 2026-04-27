import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Header from "@/components/Header";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WORLDS, CATEGORIES_BY_WORLD, type WorldId } from "@/lib/worlds";

export default async function Dashboard() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Fetch stats
  const [totalWords, verifiedWords, categoryStats, recentActivity] = await Promise.all([
    prisma.word.count(),
    prisma.word.count({ where: { verified: true } }),
    prisma.word.groupBy({
      by: ["category"],
      _count: { category: true },
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        word: {
          select: { word: true },
        },
        user: {
          select: { email: true },
        },
      },
    }),
  ]);

  // Roll up category counts into world counts using the same mapping the
  // app uses — keeps the dashboard honest if the category list drifts.
  const categoryCounts: Record<string, number> = {};
  categoryStats.forEach((stat) => {
    categoryCounts[stat.category] = stat._count.category;
  });
  const worldCounts: Record<WorldId, number> = {
    animals: 0, food: 0, nature: 0, space: 0,
    objects: 0, magic: 0, sight: 0, feelings: 0,
  };
  (Object.keys(CATEGORIES_BY_WORLD) as WorldId[]).forEach((worldId) => {
    worldCounts[worldId] = CATEGORIES_BY_WORLD[worldId].reduce(
      (sum, cat) => sum + (categoryCounts[cat] || 0),
      0,
    );
  });

  const unverifiedWords = totalWords - verifiedWords;
  const verifiedPercent =
    totalWords > 0 ? Math.round((verifiedWords / totalWords) * 100) : 0;

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Overview of word curation progress
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="stat-card">
            <div className="stat-value">{totalWords.toLocaleString()}</div>
            <div className="stat-label">Total Words</div>
          </div>
          <div className="stat-card">
            <div className="stat-value text-[var(--success)]">
              {verifiedWords.toLocaleString()}
            </div>
            <div className="stat-label">Verified</div>
          </div>
          <div className="stat-card">
            <div className="stat-value text-[var(--warning)]">
              {unverifiedWords.toLocaleString()}
            </div>
            <div className="stat-label">Pending Review</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{verifiedPercent}%</div>
            <div className="stat-label">Complete</div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Link href="/review" className="card p-6 hover:shadow-md transition-normal">
            <h2 className="text-xl font-semibold mb-2">Review Queue</h2>
            <p className="text-[var(--text-secondary)]">
              Review and approve pending words. {unverifiedWords} words waiting.
            </p>
          </Link>
          <Link href="/words" className="card p-6 hover:shadow-md transition-normal">
            <h2 className="text-xl font-semibold mb-2">Browse Words</h2>
            <p className="text-[var(--text-secondary)]">
              Search, filter, and edit words in the database.
            </p>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Words by world — each row deep-links to /words pre-filtered. */}
          <div className="card p-6">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-lg font-semibold">Words by World</h2>
              <Link
                href="/reports"
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Detailed report →
              </Link>
            </div>
            <div className="space-y-1">
              {(Object.keys(worldCounts) as WorldId[])
                .sort((a, b) => worldCounts[b] - worldCounts[a])
                .map((worldId) => {
                  const world = WORLDS[worldId];
                  return (
                    <Link
                      key={worldId}
                      href={`/words?world=${worldId}`}
                      className="flex items-center justify-between py-2 px-2 -mx-2 rounded border-b border-[var(--border-light)] last:border-0 hover:bg-[var(--bg-hover)] transition-normal"
                    >
                      <span className="text-sm text-[var(--text-primary)] flex items-center gap-2">
                        <span>{world.emoji}</span>
                        <span>{world.name}</span>
                      </span>
                      <span className="text-sm font-medium text-[var(--text-secondary)]">
                        {worldCounts[worldId]}
                      </span>
                    </Link>
                  );
                })}
            </div>
          </div>

          {/* Recent activity */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 py-2 border-b border-[var(--border-light)] last:border-0"
                  >
                    <span
                      className={`badge ${
                        activity.action === "verified"
                          ? "badge-success"
                          : activity.action === "rejected"
                            ? "badge-error"
                            : "badge-neutral"
                      }`}
                    >
                      {activity.action}
                    </span>
                    <span className="text-sm font-medium">
                      {activity.word?.word || "Unknown"}
                    </span>
                    <div className="ml-auto text-right">
                      <span className="text-xs text-[var(--text-secondary)] block">
                        {activity.user?.email?.split("@")[0] || "Unknown"}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {new Date(activity.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">No recent activity</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
