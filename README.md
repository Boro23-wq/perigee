# Perigee — Advanced Calorie Tracking App

## Stack

- Frontend: Next.js on Vercel — [`/frontend`](frontend/README.md)
- Backend: Go/Gin on Cloud Run — [`/backend`](backend/README.md)
- Database + Auth + Storage: Supabase

## Live

- App: https://perigee.fit
- API: https://perigee-api-1087691478486.northamerica-northeast1.run.app

## Getting started

See [frontend/README.md](frontend/README.md) and [backend/README.md](backend/README.md) for
setup, env vars, and local dev instructions for each half of the app.

## Schema

[supabase/migrations/](supabase/migrations/) — run in order:

1. [001_initial_schema.sql](supabase/migrations/001_initial_schema.sql)
2. [002_streaks_partner_milestones.sql](supabase/migrations/002_streaks_partner_milestones.sql)
3. [003_push_notifications.sql](supabase/migrations/003_push_notifications.sql)
4. [004_feedback.sql](supabase/migrations/004_feedback.sql)
