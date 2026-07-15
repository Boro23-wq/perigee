# Perigee backend

Go/Gin API, verifies Supabase-issued JWTs and talks to Postgres via the Supabase
connection pooler.

## Setup

```bash
cp .env.example .env   # fill in real values from the Supabase dashboard
go run .
```

```bash
curl localhost:8080/health                              # -> {"status":"ok"}
curl localhost:8080/api/me                               # -> 401, no token
curl localhost:8080/api/me -H "Authorization: Bearer <access_token>"
```

## Deploy (Cloud Run)

Deploys from source — Cloud Run builds `Dockerfile` via Cloud Build, no local
Docker build/push needed. Project: `portfolio-303809`, region:
`northamerica-northeast1` (closest to the Supabase `ca-central-1` pooler).

```bash
gcloud run deploy perigee-api \
  --source . \
  --project=portfolio-303809 \
  --region=northamerica-northeast1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=256Mi --cpu=1 \
  --min-instances=0 --max-instances=3
```

Env vars (`DATABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_URL`, `FRONTEND_ORIGIN`,
`SUPABASE_SERVICE_ROLE_KEY`, `MEAL_PHOTOS_BUCKET`, `AVATARS_BUCKET`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `USDA_FDC_API_KEY`) are set via
`--env-vars-file` (a YAML of `KEY: value` built from `.env`) or updated afterward with:

```bash
gcloud run services update perigee-api --region=northamerica-northeast1 \
  --update-env-vars=KEY=value
```

`PORT` is injected automatically by Cloud Run — don't set it manually.

## Notes

- Uses `pgx.QueryExecModeSimpleProtocol` — required for Supabase's transaction-mode
  pooler (port 6543), which can route each query to a different backend connection
  and otherwise breaks pgx's prepared-statement cache.
- JWT verification supports both the modern JWKS (ES256) and legacy shared-secret
  (HS256) signing modes — see `middleware/auth.go`.

## Photo logging

Requires a private Supabase Storage bucket named `meal-photos` (Dashboard ->
Storage -> New bucket -> Private) and `SUPABASE_SERVICE_ROLE_KEY` /
`ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` set. Flow:

1. `POST /api/meals/photo/upload-url` — returns `{ path, upload_url }`; the
   client PUTs the compressed image straight to `upload_url` (bytes never hit
   this server).
2. `POST /api/meals/photo/analyze` — Go downloads the photo via a signed URL,
   sends it to Claude Vision, and inserts a `food_logs` row with
   `source='photo'`, the detected name, estimated macros, and `ai_confidence`.
3. `PATCH /api/meals/:id/adjust` — rescales calories/macros to a user-corrected
   value (proportional to the AI's original macro ratios) and sets
   `user_adjusted = true`.
4. `GET /api/meals/:id/photo-url` — short-lived signed URL to display a
   logged meal's photo.

## Push notifications & cron

`/api/internal/cron/*` (morning/evening logging reminders, milestone checks)
is meant to be hit by Cloud Scheduler, not the frontend — it's gated by
`middleware.InternalAuthRequired()`, which checks the `X-Internal-Secret`
header against `CRON_SECRET`. Notifications themselves are Web Push, sent via
`push.SendToUser` using the `VAPID_*` keypair; the public key is exposed to
the frontend at `GET /api/push/vapid-public-key` so it never has to be baked
into the frontend build. Partner "pokes" (`handlers/pokes.go`) and milestone
nudges reuse the same `push` package.
