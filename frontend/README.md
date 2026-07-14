# Trellis frontend

Next.js (App Router) + Supabase Auth (`@supabase/ssr`, httpOnly cookie sessions).

## Setup

```bash
cp .env.local.example .env.local   # fill in real values from the Supabase dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The Go backend
(`../backend`) needs to be running too for `/dashboard` and `/log` to load data.

## Deploy (Vercel)

```bash
vercel --prod
```

Env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_API_URL`) are set per-environment via `vercel env add <name> production`.

## Notes

- This Next.js version renamed `middleware.ts` → `proxy.ts` (see `src/proxy.ts`) —
  check `node_modules/next/dist/docs` before assuming an older API still applies.
- Access tokens live in memory only, never `localStorage` — the `@supabase/ssr`
  cookie pattern handles refresh/session storage.
