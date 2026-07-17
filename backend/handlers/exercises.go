package handlers

import "github.com/gin-gonic/gin"

type Exercise struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	MET  float64 `json:"met"`
}

// exercises is a small, static MET (metabolic equivalent of task) table
// sourced from the Compendium of Physical Activities — a public-domain
// reference, not a FatSecret dataset. FatSecret's exercise-related methods
// turned out to require per-user 3-legged OAuth (their hosted diary), which
// doesn't fit an app that stores its own activity history, so calorie burn
// is computed here instead: calories = MET * weight_kg * hours.
var exercises = []Exercise{
	{"walking_moderate", "Walking (moderate pace)", 3.5},
	{"walking_brisk", "Walking (brisk pace)", 4.3},
	{"running_6mph", "Running (6 mph / 10 min mile)", 9.8},
	{"running_8mph", "Running (8 mph / 7.5 min mile)", 11.8},
	{"running_10mph", "Running (10 mph / 6 min mile)", 14.5},
	{"cycling_leisure", "Cycling (leisure, under 10 mph)", 4.0},
	{"cycling_moderate", "Cycling (moderate, 12-14 mph)", 8.0},
	{"cycling_vigorous", "Cycling (vigorous, 16-19 mph)", 12.0},
	{"swimming_leisure", "Swimming (leisure)", 6.0},
	{"swimming_laps", "Swimming (laps, moderate)", 8.3},
	{"weight_training_light", "Weight training (light effort)", 3.5},
	{"weight_training_vigorous", "Weight training (vigorous effort)", 6.0},
	{"yoga", "Yoga", 2.5},
	{"pilates", "Pilates", 3.0},
	{"hiit", "HIIT / circuit training", 8.0},
	{"elliptical", "Elliptical trainer", 5.0},
	{"rowing_moderate", "Rowing machine (moderate)", 7.0},
	{"rowing_vigorous", "Rowing machine (vigorous)", 8.5},
	{"stair_climber", "Stair climber", 9.0},
	{"basketball", "Basketball (game)", 8.0},
	{"soccer", "Soccer (casual)", 7.0},
	{"tennis", "Tennis (singles)", 8.0},
	{"boxing", "Boxing (training)", 9.0},
	{"dancing", "Dancing (general)", 5.0},
	{"hiking", "Hiking", 6.0},
	{"jump_rope", "Jump rope", 11.0},
	{"golf", "Golf (walking, carrying clubs)", 4.3},
	{"stretching", "Stretching", 2.3},
	{"climbing_stairs", "Climbing stairs", 8.8},
	{"skiing_downhill", "Skiing (downhill)", 6.0},
	{"snowboarding", "Snowboarding", 5.3},
	{"crossfit", "CrossFit-style workout", 8.0},
	{"spin_class", "Spin class", 8.5},
	{"martial_arts", "Martial arts", 10.3},
	{"paddleboarding", "Paddleboarding", 6.0},
	{"kayaking", "Kayaking", 5.0},
	{"gardening", "Gardening / yard work", 4.0},
	{"cleaning", "Housework / cleaning", 3.3},
}

// GetExercises returns the full static exercise/MET table — small enough
// (under 40 entries) that the frontend fetches it once and filters
// client-side rather than round-tripping a search query per keystroke.
func GetExercises(c *gin.Context) {
	c.JSON(200, gin.H{"exercises": exercises})
}
