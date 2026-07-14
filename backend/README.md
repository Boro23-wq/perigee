# Trellis backend

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
grep -E '^(DATABASE_URL|SUPABASE_JWT_SECRET|SUPABASE_URL|FRONTEND_ORIGIN)=' .env \
  | fly secrets import --app trellis-api-boro23
```

## Notes

- Uses `pgx.QueryExecModeSimpleProtocol` — required for Supabase's transaction-mode
  pooler (port 6543), which can route each query to a different backend connection
  and otherwise breaks pgx's prepared-statement cache.
- JWT verification supports both the modern JWKS (ES256) and legacy shared-secret
  (HS256) signing modes — see `middleware/auth.go`.
