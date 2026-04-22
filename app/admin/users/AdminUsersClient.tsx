"use client";

import { useCallback, useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
};

type Invite = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  createdBy?: { email: string };
};

type IssuedInvite = { email: string; link: string };

export default function AdminUsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Link returned from the most recent POST. Shown prominently so the
  // admin can copy + email it to the recipient — our MVP stand-in for a
  // transactional email provider.
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, iRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/invites"),
      ]);
      if (uRes.ok) {
        const data = await uRes.json();
        setUsers(data.users);
      }
      if (iRes.ok) {
        const data = await iRes.json();
        setInvites(data.invites);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create invite");
        return;
      }
      setIssued({ email: data.invite.email, link: data.link });
      setInviteEmail("");
      await refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this invite? The link will stop working immediately.")) {
      return;
    }
    const res = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" });
    if (res.ok) {
      await refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Could not revoke invite");
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
      setTimeout(() => setCopiedLink((current) => (current === link ? null : current)), 1800);
    } catch {
      // Clipboard API can fail on insecure contexts — fall back to a prompt
      // so the admin can still select + copy the link manually.
      prompt("Copy this invite link:", link);
    }
  };

  return (
    <div className="space-y-8">
      {/* Invite form */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-1">Invite a new reviewer</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          We&apos;ll generate a signup link valid for 7 days. Copy it and email it to them
          yourself — automatic email delivery is coming later.
        </p>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="reviewer@example.com"
            className="input flex-1"
            disabled={submitting}
          />
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? <span className="spinner" /> : "Create invite"}
          </button>
        </form>
        {error && (
          <div className="mt-3 bg-[var(--error-bg)] text-[var(--error)] px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}
        {issued && (
          <div className="mt-4 rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
            <div className="text-sm font-medium mb-1">
              Invite created for {issued.email}
            </div>
            <div className="text-xs text-[var(--text-secondary)] mb-3">
              Send this link to the new reviewer. They&apos;ll set their password and get access.
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={issued.link}
                className="input flex-1 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => copyLink(issued.link)}
                className="btn btn-secondary text-sm"
              >
                {copiedLink === issued.link ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Pending invites */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Pending invites</h2>
        {loading ? (
          <div className="text-sm text-[var(--text-secondary)]">Loading…</div>
        ) : invites.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)]">No pending invites.</div>
        ) : (
          <ul className="divide-y divide-[var(--border-light)]">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{invite.email}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Invited{" "}
                    {new Date(invite.createdAt).toLocaleDateString()} · expires{" "}
                    {new Date(invite.expiresAt).toLocaleDateString()}
                    {invite.createdBy ? ` · by ${invite.createdBy.email}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(invite.id)}
                  className="btn btn-secondary text-xs"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Active users */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Active users</h2>
        {loading ? (
          <div className="text-sm text-[var(--text-secondary)]">Loading…</div>
        ) : users.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)]">No users yet.</div>
        ) : (
          <ul className="divide-y divide-[var(--border-light)]">
            {users.map((user) => (
              <li key={user.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{user.email}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Joined {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {user.isAdmin && (
                  <span className="badge badge-success">Admin</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
