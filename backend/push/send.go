package push

import (
	"context"
	"encoding/json"
	"log"
	"os"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/Boro23-wq/perigee/backend/db"
)

type payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url,omitempty"`
}

// SendToUser pushes a notification to every browser subscription the user
// currently has registered. Failures are per-subscription and best-effort —
// a dead endpoint (410/404, meaning the browser unsubscribed or the
// subscription expired) is cleaned up rather than retried.
func SendToUser(ctx context.Context, userID, title, body, url string) error {
	rows, err := db.Pool.Query(ctx,
		`SELECT endpoint, p256dh, auth FROM public.push_subscriptions WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	type sub struct{ endpoint, p256dh, auth string }
	var subs []sub
	for rows.Next() {
		var s sub
		if err := rows.Scan(&s.endpoint, &s.p256dh, &s.auth); err != nil {
			return err
		}
		subs = append(subs, s)
	}

	msg, err := json.Marshal(payload{Title: title, Body: body, URL: url})
	if err != nil {
		return err
	}

	options := &webpush.Options{
		Subscriber:      os.Getenv("VAPID_SUBJECT"),
		VAPIDPublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
		VAPIDPrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
		TTL:             3600,
	}

	for _, s := range subs {
		resp, err := webpush.SendNotificationWithContext(ctx, msg, &webpush.Subscription{
			Endpoint: s.endpoint,
			Keys:     webpush.Keys{P256dh: s.p256dh, Auth: s.auth},
		}, options)
		if err != nil {
			log.Printf("push send error for user %s: %v", userID, err)
			continue
		}
		resp.Body.Close()

		if resp.StatusCode == 404 || resp.StatusCode == 410 {
			if _, err := db.Pool.Exec(ctx,
				`DELETE FROM public.push_subscriptions WHERE endpoint = $1`, s.endpoint,
			); err != nil {
				log.Printf("failed to remove stale push subscription: %v", err)
			}
		}
	}

	return nil
}
