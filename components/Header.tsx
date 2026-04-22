"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const navItems = [
    { href: "/", label: "Dashboard" },
    { href: "/review", label: "Review" },
    { href: "/words", label: "Words" },
    { href: "/activity", label: "Activity" },
    // Users section is admin-only; other roles never see the link.
    ...(session?.user?.isAdmin ? [{ href: "/admin/users", label: "Users" }] : []),
  ];

  return (
    <header className="bg-white border-b border-[var(--border-light)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-semibold text-[var(--text-primary)]">
              Word Procurement
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative px-3 py-2 text-sm transition-colors ${
                    active
                      ? "text-[var(--text-primary)] font-semibold"
                      : "text-[var(--text-secondary)] font-normal hover:text-[var(--text-primary)]"
                  }`}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-3 right-3 -bottom-[17px] h-[2px] bg-[var(--accent)]"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User menu */}
          <div className="flex items-center gap-4">
            {session?.user ? (
              <>
                <span className="text-sm text-[var(--text-secondary)]">
                  {session.user.email}
                </span>
                <button onClick={handleSignOut} className="btn btn-secondary text-sm">
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login" className="btn btn-primary text-sm">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
