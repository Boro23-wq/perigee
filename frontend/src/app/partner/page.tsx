"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Flame, Hand } from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/date";
import { AppHeader } from "@/components/AppHeader";
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

type ComparisonSide = {
  logged_today: boolean;
  current_streak: number;
};

type Comparison = {
  me: ComparisonSide;
  partner: ComparisonSide;
  poked_today: boolean;
};

type RecentPoke = {
  id: string;
  sender_id: string;
  created_at: string;
};

export default function PartnerPage() {
  const [status, setStatus] = useState<PartnerStatus | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [poking, setPoking] = useState(false);
  const [pokedToday, setPokedToday] = useState(false);
  const [pokeBanner, setPokeBanner] = useState<string | null>(null);
  const [recentPokes, setRecentPokes] = useState<RecentPoke[]>([]);

  async function load() {
    const data = await api.get("/api/partner");
    setStatus(data);
  }

  async function loadRecentPokes() {
    try {
      const pokes = await api.get("/api/partner/pokes/recent");
      setRecentPokes(pokes.pokes);
    } catch {
      // best-effort refresh — leave the existing list in place on failure
    }
  }

  useEffect(() => {
    async function run() {
      try {
        const data = await api.get("/api/partner");
        setStatus(data);
        if (data.status === "active") {
          const cmp = await api.get("/api/partner/comparison");
          setComparison(cmp);
          setPokedToday(cmp.poked_today);
          await loadRecentPokes();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    }
    run();

    function onFocus() {
      if (document.visibilityState === "visible") {
        loadRecentPokes();
      }
    }
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function handlePoke() {
    setPoking(true);
    setError("");
    // Optimistic: flip the button and show the banner immediately rather
    // than waiting on the round trip — roll both back if the request
    // actually fails for a reason other than "already poked today".
    setPokedToday(true);
    setPokeBanner(`Poked ${partnerName ?? "your partner"}!`);
    setTimeout(() => setPokeBanner(null), 5000);
    try {
      await api.post("/api/partner/poke", {});
      loadRecentPokes();
    } catch (err) {
      if (err instanceof Error && err.message.includes("already poked")) {
        // Already true optimistically — nothing to do.
      } else {
        setPokedToday(false);
        setPokeBanner(null);
        setError(err instanceof Error ? err.message : "Failed to poke");
      }
    } finally {
      setPoking(false);
    }
  }

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
    <div className="flex min-h-screen flex-col">
      <AppHeader />

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

        {status?.status === "active" && comparison && (
          <div className="mt-3 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <p className="label-xs">Today</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[13px] text-muted">You</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-medium">
                  {comparison.me.logged_today && (
                    <Check size={14} className="text-accent" />
                  )}
                  {comparison.me.logged_today ? "Logged" : "Not logged yet"}
                </p>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <Flame
                    size={13}
                    className={comparison.me.current_streak > 0 ? "text-accent" : ""}
                  />
                  {comparison.me.current_streak} day streak
                </div>
              </div>
              <div>
                <p className="text-[13px] text-muted">{partnerName}</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-medium">
                  {comparison.partner.logged_today && (
                    <Check size={14} className="text-accent" />
                  )}
                  {comparison.partner.logged_today ? "Logged" : "Not logged yet"}
                </p>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <Flame
                    size={13}
                    className={comparison.partner.current_streak > 0 ? "text-accent" : ""}
                  />
                  {comparison.partner.current_streak} day streak
                </div>
              </div>
            </div>

            <button
              onClick={handlePoke}
              disabled={poking || pokedToday}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 py-2 text-[13px] font-medium transition-colors hover:border-accent disabled:opacity-60"
            >
              {pokedToday && <Check size={14} className="text-accent" />}
              {pokedToday ? "Poked today" : poking ? "Poking…" : `Poke ${partnerName}`}
            </button>
          </div>
        )}

        {status?.status === "active" && recentPokes.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-surface p-5 shadow-soft">
            <p className="label-xs">Recent pokes</p>
            <div className="mt-3 flex flex-col gap-2">
              {recentPokes.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-[13px]">
                  <Hand size={14} className="text-accent" />
                  <span>{partnerName} poked you</span>
                  <span className="text-xs text-muted">{timeAgo(p.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {pokeBanner && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center px-6">
          <div className="rounded-lg bg-accent-soft px-4 py-2.5 text-[13px] text-accent shadow-lg">
            🎉 {pokeBanner}
          </div>
        </div>
      )}
    </div>
  );
}
