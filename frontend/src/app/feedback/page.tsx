"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { api } from "@/lib/api";

const CATEGORIES = [
  { value: "idea", label: "Idea" },
  { value: "bug", label: "Bug" },
  { value: "other", label: "Other" },
] as const;

export default function FeedbackPage() {
  const pathname = usePathname();
  const [category, setCategory] = useState<string>("idea");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await api.post("/api/feedback", { category, message, page: pathname });
      setMessage("");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send feedback");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-20 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">Feedback</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Found a bug or have an idea? Send it straight through — no forms,
          no tickets.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-soft"
        >
          <div className="flex gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  category === c.value
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <textarea
            required
            rows={5}
            maxLength={2000}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setSubmitted(false);
            }}
            placeholder="What's on your mind?"
            className="resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />

          {error && <p className="text-[13px] text-danger">{error}</p>}
          {submitted && !error && (
            <p className="text-[13px] text-accent">Sent — thanks!</p>
          )}

          <button
            type="submit"
            disabled={submitting || !message.trim()}
            className="self-start rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send feedback"}
          </button>
        </form>
      </main>
    </div>
  );
}
