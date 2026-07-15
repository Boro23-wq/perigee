package handlers

import (
	"context"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Boro23-wq/perigee/backend/db"
)

type milestone struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// computeEligibleMilestones derives weight-goal milestones (halfway to goal,
// and every 5 lbs of progress toward it) that have been reached but not yet
// acknowledged in milestones_seen.
func computeEligibleMilestones(ctx context.Context, userID string) ([]milestone, error) {
	var goalWeightLbs *float64
	if err := db.Pool.QueryRow(ctx,
		`SELECT weight_goal_lbs FROM public.profiles WHERE id = $1`, userID,
	).Scan(&goalWeightLbs); err != nil {
		return nil, err
	}
	if goalWeightLbs == nil {
		return []milestone{}, nil
	}

	entries, _, err := loadWeightEntries(ctx, userID, 3650)
	if err != nil {
		return nil, err
	}
	if len(entries) < 2 {
		return []milestone{}, nil
	}

	start := entries[0].WeightLbs
	current := entries[len(entries)-1].RollingAvg
	goal := *goalWeightLbs

	totalDistance := goal - start
	if totalDistance == 0 {
		return []milestone{}, nil
	}

	progress := current - start
	// Only count progress moving toward the goal — drifting the wrong way
	// shouldn't trigger a celebration.
	if (totalDistance > 0 && progress < 0) || (totalDistance < 0 && progress > 0) {
		progress = 0
	}
	progressAbs := abs(progress)
	totalAbs := abs(totalDistance)

	candidates := []milestone{}
	if progressAbs >= totalAbs/2 {
		candidates = append(candidates, milestone{Key: "halfway", Label: "Halfway to your goal!"})
	}
	for n := 5; float64(n) <= progressAbs; n += 5 {
		candidates = append(candidates, milestone{
			Key:   fmt.Sprintf("progress_%d", n),
			Label: fmt.Sprintf("%d lbs of progress!", n),
		})
	}

	seen := map[string]bool{}
	rows, err := db.Pool.Query(ctx,
		`SELECT milestone_key FROM public.milestones_seen WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		seen[key] = true
	}

	eligible := []milestone{}
	for _, m := range candidates {
		if !seen[m.Key] {
			eligible = append(eligible, m)
		}
	}
	return eligible, nil
}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

// GetPendingMilestones returns weight-goal milestones the user has newly
// crossed but hasn't seen yet. It does not mark them seen — the frontend
// acks explicitly after displaying the celebration.
func GetPendingMilestones(c *gin.Context) {
	userID := c.GetString("user_id")

	pending, err := computeEligibleMilestones(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to compute milestones"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"milestones": pending})
}

// AckMilestone marks a milestone as seen so it won't be returned again.
func AckMilestone(c *gin.Context) {
	userID := c.GetString("user_id")
	key := c.Param("key")

	if _, err := db.Pool.Exec(c.Request.Context(),
		`INSERT INTO public.milestones_seen (user_id, milestone_key) VALUES ($1, $2)
		 ON CONFLICT (user_id, milestone_key) DO NOTHING`,
		userID, key,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to ack milestone"})
		return
	}

	c.Status(http.StatusNoContent)
}
