package push

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"os"
	"strings"

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
		// webpush-go prepends "mailto:" to the subscriber unless it already
		// starts with "https:" — it does NOT check for an existing "mailto:"
		// prefix, so passing one in produces "mailto:mailto:...", which
		// Chrome/FCM silently tolerates but Apple's push service rejects
		// outright as an invalid VAPID JWT ("BadJwtToken", 403, on every
		// single send). Stripping any prefix we were given here means this
		// can't happen regardless of how VAPID_SUBJECT is set.
		Subscriber:      strings.TrimPrefix(os.Getenv("VAPID_SUBJECT"), "mailto:"),
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
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == 404 || resp.StatusCode == 410 {
			if _, err := db.Pool.Exec(ctx,
				`DELETE FROM public.push_subscriptions WHERE endpoint = $1`, s.endpoint,
			); err != nil {
				log.Printf("failed to remove stale push subscription: %v", err)
			}
			continue
		}
		// A 201/2xx here means the push service accepted it — anything else
		// (e.g. a 403 from a malformed VAPID JWT) previously vanished
		// silently since only err != nil and 404/410 were ever handled.
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			log.Printf("push send non-2xx for user %s (%d): %s", userID, resp.StatusCode, string(body))
		}
	}

	return nil
}
