import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Header from "@/components/Header";
import AdminUsersClient from "./AdminUsersClient";

// Admin-only page for managing users and pending invites. Non-admins get
// bounced to the dashboard; unauthenticated visitors get sent to login.
export default async function AdminUsersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">Users</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Invite new reviewers and manage existing accounts.
          </p>
        </div>
        <AdminUsersClient />
      </main>
    </div>
  );
}
