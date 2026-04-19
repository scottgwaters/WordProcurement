import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Header from "@/components/Header";
import Link from "next/link";
import { redirect } from "next/navigation";

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
      },
    }),
  ]);

  // Calculate category counts
  const categoryCounts: Record<string, number> = {};
  categoryStats.forEach((stat) => {
    categoryCounts[stat.category] = stat._count.category;
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
          {/* Categories breakdown */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Words by Category</h2>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {Object.entries(categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => (
                  <div
                    key={category}
                    className="flex items-center justify-between py-2 border-b border-[var(--border-light)] last:border-0"
                  >
                    <span className="text-sm text-[var(--text-primary)]">
                      {category.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">
                      {count}
                    </span>
                  </div>
                ))}
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
                    <span className="text-xs text-[var(--text-secondary)] ml-auto">
                      {new Date(activity.createdAt).toLocaleDateString()}
                    </span>
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
