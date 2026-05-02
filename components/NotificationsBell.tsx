"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Notification = {
  id: string;
  kind: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const POLL_INTERVAL_MS = 30_000;

// Header bell icon. Polls /api/notifications every 30 s for the unread
// count; opens a popover on click that lists the most recent items, marks
// them read on link-click, and exposes a "Mark all read" affordance.
// Intentionally lightweight — no websocket, no service worker — because
// the only event source today is the image worker, which already takes
// 5–15 s end-to-end (poll latency is dominated by Flux time, not by us).
export default function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items ?? []);
    setUnread(data.unreadCount ?? 0);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Close popover on outside-click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    if (unread === 0) return;
    await fetch("/api/notifications/read", { method: "POST" });
    refresh();
  };

  const handleItemClick = async (n: Notification) => {
    if (!n.readAt) {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      });
      refresh();
    }
    setOpen(false);
  };

  const iconForKind = (kind: string) => {
    if (kind === "image_done") return "🖼";
    if (kind === "image_failed") return "⚠️";
    return "•";
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="notif-bell"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="notif-bell__dot" aria-hidden>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-popover" role="dialog" aria-label="Notifications">
          <div className="notif-popover__head">
            <span className="font-medium">Notifications</span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              Mark all read
            </button>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[var(--text-secondary)] text-center">
              No notifications yet.
            </div>
          ) : (
            <ul className="notif-popover__list">
              {items.map((n) => {
                const body = (
                  <>
                    <span className="notif-item__icon" aria-hidden>
                      {iconForKind(n.kind)}
                    </span>
                    <span className="notif-item__body">
                      <span className={`notif-item__msg ${n.readAt ? "" : "font-medium"}`}>
                        {n.message}
                      </span>
                      <span className="notif-item__time">
                        {new Date(n.createdAt).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </span>
                    {!n.readAt && <span className="notif-item__pip" aria-hidden />}
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => handleItemClick(n)}
                        className="notif-item"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className="notif-item w-full text-left"
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
