"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  // Close the drawer whenever the route changes — reviewers tapping a nav
  // item should land on the new page with the drawer dismissed.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer is open + handle Escape to dismiss.
  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const navItems = [
    { href: "/", label: "Dashboard" },
    { href: "/review", label: "Review" },
    { href: "/words", label: "Words" },
    { href: "/reports", label: "Reports" },
    { href: "/activity", label: "Activity" },
    // Users section is admin-only; other roles never see the link.
    ...(session?.user?.isAdmin ? [{ href: "/admin/users", label: "Users" }] : []),
  ];

  const email = session?.user?.email ?? "";
  const avatarLetter = email ? email[0]?.toUpperCase() : "?";

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link href="/" className="app-header__brand">
            Word Procurement
          </Link>

          <nav className="app-header__nav" aria-label="Main">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="app-header__link"
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="app-header__user">
            {session?.user ? (
              <>
                <span className="app-header__email" title={email}>
                  {email}
                </span>
                <span
                  className="app-header__avatar"
                  aria-label={email}
                  title={email}
                >
                  {avatarLetter}
                </span>
                <button
                  onClick={handleSignOut}
                  className="btn btn-secondary text-sm"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login" className="btn btn-primary text-sm">
                Sign in
              </Link>
            )}
          </div>

          <button
            type="button"
            className="app-header__menu-btn"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="app-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div
            className="app-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            id="app-drawer"
            className="app-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
          >
            <div className="app-drawer__head">
              <span className="app-drawer__title">Menu</span>
              <button
                type="button"
                className="app-drawer__close"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <nav className="app-drawer__nav" aria-label="Main">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="app-drawer__link"
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="app-drawer__foot">
              {session?.user ? (
                <>
                  <span className="app-drawer__email">{email}</span>
                  <button
                    onClick={handleSignOut}
                    className="btn btn-secondary"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link href="/login" className="btn btn-primary">
                  Sign in
                </Link>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
