"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Status = "checking" | "ready" | "invalid" | "expired" | "used";

// Public page rendered at /invite/[token]. Validates the token against
// /api/invites/[token], then prompts the recipient to set a password.
// On success we auto-sign them in and drop them at the dashboard.
export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token ?? "";

  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/invites/${token}`);
        const data = await res.json();
        if (res.ok) {
          setEmail(data.email);
          setStatus("ready");
          return;
        }
        if (res.status === 410) {
          // Server distinguishes used vs. expired via the message text,
          // so sniff for "used" and fall back to expired otherwise.
          setStatus(
            typeof data.error === "string" && data.error.toLowerCase().includes("used")
              ? "used"
              : "expired"
          );
          setErrorMessage(data.error ?? null);
        } else {
          setStatus("invalid");
          setErrorMessage(data.error ?? null);
        }
      } catch {
        setStatus("invalid");
        setErrorMessage("Could not contact the server.");
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Could not set up your account.");
        return;
      }

      // Sign the brand-new user in immediately so they land on the
      // dashboard without a second password entry.
      const signInResult = await signIn("credentials", {
        email: data.email,
        password,
        redirect: false,
      });
      if (signInResult?.error) {
        // Account was created but sign-in failed (unusual). Send them to
        // the login page so they can sign in manually.
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderHeading = () => (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
        Word Procurement
      </h1>
      <p className="text-[var(--text-secondary)] mt-2">Set up your account</p>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)] px-4">
      <div className="w-full max-w-md">
        {renderHeading()}

        <div className="card p-8">
          {status === "checking" && (
            <div className="flex items-center justify-center py-6">
              <span className="spinner" />
            </div>
          )}

          {(status === "invalid" || status === "expired" || status === "used") && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Invite unavailable</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {errorMessage ??
                  "This invite link is no longer valid. Ask your administrator for a new one."}
              </p>
              <a href="/login" className="btn btn-secondary w-full">
                Go to sign in
              </a>
            </div>
          )}

          {status === "ready" && (
            <>
              <h2 className="text-xl font-semibold mb-1">Welcome!</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Creating an account for{" "}
                <span className="font-medium text-[var(--text-primary)]">{email}</span>.
                Choose a password to finish signing up.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="input"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm"
                    className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="input"
                    placeholder="Repeat password"
                  />
                </div>

                {formError && (
                  <div className="bg-[var(--error-bg)] text-[var(--error)] px-4 py-3 rounded-lg text-sm">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary w-full"
                >
                  {submitting ? <span className="spinner" /> : "Create account"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
