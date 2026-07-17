package handlers

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
	"github.com/Boro23-wq/perigee/backend/push"
)

// pokeBodies are playful rather than the old flat "checking in on you" —
// %s is the sender's display name (or email if they haven't set one).
var pokeBodies = []string{
	"%s just poked you. Poke them back!",
	"%s is side-eyeing your streak 👀",
	"Boop! %s poked you.",
	"%s wants to know if you've eaten today 🍽️",
	"%s is stalking your calorie log.",
	"Incoming poke from %s. Don't leave them on read.",
}

// pokeMessage picks a random title/body pair for the push notification a
// poke triggers — same info every time (who poked), just not the same
// flat sentence.
func pokeMessage(senderName string) (title, body string) {
	return "👉 Poke!", fmt.Sprintf(pokeBodies[rand.Intn(len(pokeBodies))], senderName)
}

// activePartnerID resolves the caller's active partner, if any.
func activePartnerID(ctx context.Context, userID string) (string, error) {
	var partnerID string
	err := db.Pool.QueryRow(ctx,
		`SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END
		 FROM public.relationships
		 WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'active'`,
		userID,
	).Scan(&partnerID)
	return partnerID, err
}

type comparisonSide struct {
	LoggedToday   bool `json:"logged_today"`
	CurrentStreak int  `json:"current_streak"`
}

type partnerComparison struct {
	Me         comparisonSide `json:"me"`
	Partner    comparisonSide `json:"partner"`
	PokedToday bool           `json:"poked_today"`
}

func sideFor(ctx context.Context, userID string) (comparisonSide, error) {
	var timezone string
	if err := db.Pool.QueryRow(ctx,
		`SELECT timezone FROM public.profiles WHERE id = $1`, userID,
	).Scan(&timezone); err != nil {
		return comparisonSide{}, err
	}
	streak, err := computeStreak(ctx, userID, timezone)
	if err != nil {
		return comparisonSide{}, err
	}
	return comparisonSide{LoggedToday: streak.LoggedToday, CurrentStreak: streak.CurrentStreak}, nil
}

// GetPartnerComparison shows both sides of an active partnership: who's
// logged today and each person's current streak, side by side.
func GetPartnerComparison(c *gin.Context) {
	userID := c.GetString("user_id")

	partnerID, err := activePartnerID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active partner"})
		return
	}

	me, err := sideFor(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load your streak"})
		return
	}
	partner, err := sideFor(c.Request.Context(), partnerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load partner streak"})
		return
	}

	var timezone string
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT timezone FROM public.profiles WHERE id = $1`, userID,
	).Scan(&timezone); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}

	var pokedToday bool
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT EXISTS(
			SELECT 1 FROM public.pokes
			WHERE sender_id = $1 AND recipient_id = $2 AND date = $3
		)`,
		userID, partnerID, localToday(timezone),
	).Scan(&pokedToday); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load poke status"})
		return
	}

	c.JSON(http.StatusOK, partnerComparison{Me: me, Partner: partner, PokedToday: pokedToday})
}

// PokePartner sends a lightweight nudge to the caller's active partner. The
// UNIQUE(sender_id, recipient_id, date) constraint on pokes is the
// once-per-day-per-direction cooldown — a conflict means already poked today.
func PokePartner(c *gin.Context) {
	userID := c.GetString("user_id")

	partnerID, err := activePartnerID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active partner"})
		return
	}

	var timezone string
	if err := db.Pool.QueryRow(c.Request.Context(),
		`SELECT timezone FROM public.profiles WHERE id = $1`, userID,
	).Scan(&timezone); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}

	var id string
	err = db.Pool.QueryRow(c.Request.Context(),
		`INSERT INTO public.pokes (sender_id, recipient_id, date)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (sender_id, recipient_id, date) DO NOTHING
		 RETURNING id`,
		userID, partnerID, localToday(timezone),
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already poked your partner today"})
		return
	}

	// Best-effort — a failed push should never fail the poke itself.
	go func() {
		ctx := context.Background()
		name := "Your partner"
		if sender, err := loadPartnerInfo(ctx, userID); err == nil {
			if sender.DisplayName != nil && *sender.DisplayName != "" {
				name = *sender.DisplayName
			} else {
				name = sender.Email
			}
		}
		title, body := pokeMessage(name)
		if err := push.SendToUser(ctx, partnerID, title, body, "/partner"); err != nil {
			log.Printf("PokePartner push error: %v", err)
		}
	}()

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

type recentPoke struct {
	ID        string `json:"id"`
	SenderID  string `json:"sender_id"`
	CreatedAt string `json:"created_at"`
}

// GetRecentPokes returns the caller's last few incoming pokes, newest first.
func GetRecentPokes(c *gin.Context) {
	userID := c.GetString("user_id")

	rows, err := db.Pool.Query(c.Request.Context(),
		`SELECT id, sender_id, created_at FROM public.pokes
		 WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 5`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load pokes"})
		return
	}
	defer rows.Close()

	pokes := []recentPoke{}
	for rows.Next() {
		var p recentPoke
		if err := rows.Scan(&p.ID, &p.SenderID, &p.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read pokes"})
			return
		}
		pokes = append(pokes, p)
	}

	c.JSON(http.StatusOK, gin.H{"pokes": pokes})
}
