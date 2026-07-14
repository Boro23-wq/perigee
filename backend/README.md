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

## Deploy (Fly.io)

```bash
fly deploy --app trellis-api-boro23
```

Secrets are set with `fly secrets import` (reads `NAME=VALUE` from stdin, avoids
shell-escaping issues with special characters in the DB password):

```bash
grep -E '^(DATABASE_URL|SUPABASE_JWT_SECRET|SUPABASE_URL|FRONTEND_ORIGIN|SUPABASE_SERVICE_ROLE_KEY|MEAL_PHOTOS_BUCKET|ANTHROPIC_API_KEY|ANTHROPIC_MODEL)=' .env \
  | fly secrets import --app trellis-api-boro23
```

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
