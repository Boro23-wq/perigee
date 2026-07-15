package handlers

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
	"github.com/Boro23-wq/perigee/backend/push"
)

type profileMatch struct {
	userID   string
	timezone string
}

// usersInReminderWindow returns every profile whose local wall-clock time
// currently falls within [hour:00, hour:15) — matches a Cloud Scheduler job
// that fires every 15 minutes across all timezones, so each user's own
// "8am" is caught by exactly one run regardless of their offset from UTC.
func usersInReminderWindow(ctx context.Context, hour int) ([]profileMatch, error) {
	rows, err := db.Pool.Query(ctx, `SELECT id, timezone FROM public.profiles`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var matches []profileMatch
	for rows.Next() {
		var m profileMatch
		if err := rows.Scan(&m.userID, &m.timezone); err != nil {
			return nil, err
		}
		loc, err := time.LoadLocation(m.timezone)
		if err != nil {
			continue
		}
		now := time.Now().In(loc)
		if now.Hour() == hour && now.Minute() < 15 {
			matches = append(matches, m)
		}
	}
	return matches, nil
}

func localToday(timezone string) string {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	return time.Now().In(loc).Format("2006-01-02")
}

// CronMorningReminder pushes a weigh-in nudge to users in their local 8am
// window who haven't logged a weight entry yet today.
func CronMorningReminder(c *gin.Context) {
	matches, err := usersInReminderWindow(c.Request.Context(), 8)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load profiles"})
		return
	}

	sent := 0
	for _, m := range matches {
		var loggedToday bool
		if err := db.Pool.QueryRow(c.Request.Context(),
			`SELECT EXISTS(SELECT 1 FROM public.weight_logs WHERE user_id = $1 AND date = $2)`,
			m.userID, localToday(m.timezone),
		).Scan(&loggedToday); err != nil || loggedToday {
			continue
		}
		if err := push.SendToUser(c.Request.Context(), m.userID,
			"Morning weigh-in", "Don't forget to log today's weight.", "/weight"); err != nil {
			log.Printf("CronMorningReminder push error for %s: %v", m.userID, err)
			continue
		}
		sent++
	}

	c.JSON(http.StatusOK, gin.H{"sent": sent})
}

// CronEveningReminder pushes a logging nudge to users in their local 8pm
// window who haven't logged any meal yet today.
func CronEveningReminder(c *gin.Context) {
	matches, err := usersInReminderWindow(c.Request.Context(), 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load profiles"})
		return
	}

	sent := 0
	for _, m := range matches {
		var loggedToday bool
		if err := db.Pool.QueryRow(c.Request.Context(),
			`SELECT EXISTS(SELECT 1 FROM public.food_logs WHERE user_id = $1 AND date = $2)`,
			m.userID, localToday(m.timezone),
		).Scan(&loggedToday); err != nil || loggedToday {
			continue
		}
		if err := push.SendToUser(c.Request.Context(), m.userID,
			"Log today's meals", "You haven't logged anything today yet.", "/log"); err != nil {
			log.Printf("CronEveningReminder push error for %s: %v", m.userID, err)
			continue
		}
		sent++
	}

	c.JSON(http.StatusOK, gin.H{"sent": sent})
}

// CronCheckMilestones pushes newly-crossed weight-goal milestones to every
// user with an active goal, and acks them immediately — unlike the on-demand
// dashboard check, the cron path can't rely on the frontend to ack after
// display, so it marks them seen right away to avoid double-sending.
func CronCheckMilestones(c *gin.Context) {
	rows, err := db.Pool.Query(c.Request.Context(),
		`SELECT id FROM public.profiles WHERE weight_goal_lbs IS NOT NULL`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load profiles"})
		return
	}
	var userIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read profiles"})
			return
		}
		userIDs = append(userIDs, id)
	}
	rows.Close()

	sent := 0
	for _, userID := range userIDs {
		pending, err := computeEligibleMilestones(c.Request.Context(), userID)
		if err != nil || len(pending) == 0 {
			continue
		}
		for _, m := range pending {
			if err := push.SendToUser(c.Request.Context(), userID,
				"Milestone reached!", m.Label, "/dashboard"); err != nil {
				log.Printf("CronCheckMilestones push error for %s: %v", userID, err)
				continue
			}
			if _, err := db.Pool.Exec(c.Request.Context(),
				`INSERT INTO public.milestones_seen (user_id, milestone_key) VALUES ($1, $2)
				 ON CONFLICT (user_id, milestone_key) DO NOTHING`,
				userID, m.Key,
			); err != nil {
				log.Printf("CronCheckMilestones ack error for %s: %v", userID, err)
				continue
			}
			sent++
		}
	}

	c.JSON(http.StatusOK, gin.H{"sent": sent})
}
