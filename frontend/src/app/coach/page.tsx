"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";

type Message = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

const STARTERS = [
  "Can I lose 40lbs by December 2026?",
  "Is my current trend actually on pace?",
  "What's a realistic goal for the next 3 months?",
];

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get("/api/coach/messages")
      .then((data) => setMessages(data.messages))
      .catch(() => setMessages([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(content: string) {
    if (!content.trim() || sending) return;
    setError("");
    setInput("");
    setMessages((prev) => [...(prev ?? []), { role: "user", content }]);
    setSending(true);

    try {
      const reply = await api.post("/api/coach/messages", { content });
      setMessages((prev) => [...(prev ?? []), { role: "assistant", content: reply.content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coach is unavailable right now");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await sendMessage(input);
  }

  return (
    <div className="flex min-h-screen flex-col">
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

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-6 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">Coach</h1>
        <p className="mt-1 text-[13px] text-muted">
          Grounded in your real numbers: weight trend, calorie budget, and goal. Advisory
          only: it can&apos;t change settings or log anything for you.
        </p>

        <div className="mt-5 flex-1 rounded-xl border border-border bg-surface shadow-soft">
          <div className="flex h-125 flex-col gap-3 overflow-y-auto p-4">
            {!messages && (
              <>
                <Skeleton className="h-10 w-2/3 rounded-2xl" />
                <Skeleton className="ml-auto h-8 w-1/2 rounded-2xl" />
              </>
            )}

            {messages && messages.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <p className="text-[13px] text-muted">
                  Ask about your trend, a timeline, or a goal, and the coach will do the
                  actual math against your real data.
                </p>
                <div className="flex flex-col gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] transition-colors hover:border-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages?.map((m, i) => (
              <div
                key={i}
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "self-end bg-accent text-accent-foreground"
                    : "self-start bg-surface-2 text-foreground"
                }`}
              >
                {m.content}
              </div>
            ))}

            {sending && (
              <div className="self-start rounded-2xl bg-surface-2 px-4 py-2.5 text-[13px] text-muted">
                Thinking…
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the coach anything…"
              disabled={sending}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      </main>
    </div>
  );
}
