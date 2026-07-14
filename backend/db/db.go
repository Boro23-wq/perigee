package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

// Init opens a pooled connection to Postgres. Use the Supabase POOLER URL
// (port 6543, "Transaction" mode), not the direct 5432 connection — this is
// what lets the app scale to multiple instances without exhausting Postgres
// connections.
func Init(databaseURL string) error {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return err
	}
	cfg.MaxConns = 10 // Supabase free tier allows ~60; leave headroom
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute

	// The Supabase pooler (port 6543, transaction mode) can route each query
	// to a different backend connection, so server-side prepared statements
	// collide across requests. Simple protocol avoids naming/caching them.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return err
	}

	// pgxpool connects lazily, so ping now to fail fast on bad credentials
	// or an unreachable host instead of on the first request.
	if err := pool.Ping(context.Background()); err != nil {
		return err
	}

	Pool = pool
	return nil
}
