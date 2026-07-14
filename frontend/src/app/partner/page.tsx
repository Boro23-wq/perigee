"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/Skeleton";

type PartnerInfo = {
  id: string;
  email: string;
  display_name: string | null;
};

type PartnerStatus = {
  status: "none" | "pending_outgoing" | "pending_incoming" | "active";
  relationship_id: string | null;
  partner: PartnerInfo | null;
};

export default function PartnerPage() {
  const [status, setStatus] = useState<PartnerStatus | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const data = await api.get("/api/partner");
    setStatus(data);
  }

  useEffect(() => {
    async function run() {
      try {
        const data = await api.get("/api/partner");
        setStatus(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    }
    run();
  }, []);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/api/partner/request", { email });
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/partner/accept", {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeclineOrDisconnect() {
    setBusy(true);
    setError("");
    try {
      await api.delete("/api/partner");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const partnerName = status?.partner?.display_name || status?.partner?.email;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4 sm:px-8">
          <Logo />
          <Link
            href="/dashboard"
            className="text-[13px] text-muted hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">Partner</h1>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

        {!status && (
          <div className="mt-7 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
        )}

        {status?.status === "none" && (
          <div className="mt-7 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <p className="label-xs">Connect with your partner</p>
            <p className="mt-1 text-[13px] text-muted">
              Send a request to their email. Once connected, you&apos;ll share recipes and
              check-ins.
            </p>
            <form onSubmit={handleRequest} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                placeholder="partner@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50 sm:shrink-0"
              >
                {busy ? "Sending…" : "Send request"}
              </button>
            </form>
          </div>
        )}

        {status?.status === "pending_outgoing" && (
          <div className="mt-7 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <p className="label-xs">Request sent</p>
            <p className="mt-1 text-base font-semibold tracking-tight">{partnerName}</p>
            <p className="mt-1 text-[13px] text-muted">Waiting for them to accept.</p>
            <button
              onClick={handleDeclineOrDisconnect}
              disabled={busy}
              className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-medium transition-colors hover:border-accent disabled:opacity-50"
            >
              Cancel request
            </button>
          </div>
        )}

        {status?.status === "pending_incoming" && (
          <div className="mt-7 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <p className="label-xs">Connection request</p>
            <p className="mt-1 text-base font-semibold tracking-tight">{partnerName}</p>
            <p className="mt-1 text-[13px] text-muted">wants to connect with you.</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleAccept}
                disabled={busy}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={handleDeclineOrDisconnect}
                disabled={busy}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-medium transition-colors hover:border-accent disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {status?.status === "active" && (
          <div className="mt-7 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <p className="label-xs">Connected</p>
            <p className="mt-1 text-base font-semibold tracking-tight">{partnerName}</p>
            <button
              onClick={handleDeclineOrDisconnect}
              disabled={busy}
              className="mt-4 text-[13px] text-muted hover:text-danger transition-colors disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
