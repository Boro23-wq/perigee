package handlers

import (
	"fmt"
	"testing"
	"time"
)

// Not a real assertion-based test — just a sanity print to eyeball the
// filter's behavior against a realistic noisy weight-loss series before
// trusting it in production. Run with: go test ./handlers -run TestKalmanSanity -v
func TestKalmanSanity(t *testing.T) {
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	// True underlying weight loses exactly 1 lb/week (0.1428 lb/day) from 200,
	// with realistic day-to-day noise layered on top (water/sodium swings).
	noise := []float64{0, 1.2, -0.8, 2.1, -1.5, 0.3, -0.2, 1.8, -2.3, 0.6,
		-0.9, 1.4, 0.1, -1.7, 2.0, -0.4, 0.8, -1.1, 1.6, -0.6,
		0.9, -1.3, 0.4, 1.0, -0.7, 1.9, -1.4, 0.2, -0.3, 1.1}

	var dates []time.Time
	var weights []float64
	trueWeight := 200.0
	for i := 0; i < len(noise); i++ {
		dates = append(dates, start.AddDate(0, 0, i))
		weights = append(weights, trueWeight+noise[i])
		trueWeight -= 1.0 / 7.0
	}

	smoothed, trendPerWeek := kalmanWeightFilter(dates, weights)

	fmt.Println("day  raw     smoothed")
	for i := range weights {
		fmt.Printf("%3d  %6.1f  %6.2f\n", i, weights[i], smoothed[i])
	}
	fmt.Printf("\nfinal trend estimate: %.2f lbs/week (true rate: -1.00 lbs/week)\n", trendPerWeek)
	fmt.Printf("last raw: %.1f | last smoothed: %.2f | true weight at end: %.2f\n",
		weights[len(weights)-1], smoothed[len(smoothed)-1], trueWeight+1.0/7.0)
}

func TestKalmanSanityGapAndPlateau(t *testing.T) {
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	var dates []time.Time
	var weights []float64

	// Phase 1: losing 1.5 lb/week for 3 weeks.
	w := 210.0
	for i := 0; i < 21; i++ {
		dates = append(dates, start.AddDate(0, 0, i))
		weights = append(weights, w+noiseAt(i))
		w -= 1.5 / 7.0
	}
	// Gap: an 8-day break in logging (vacation).
	// Phase 2: plateaued (0 lb/week) for 3 weeks, resuming after the gap.
	for i := 29; i < 50; i++ {
		dates = append(dates, start.AddDate(0, 0, i))
		weights = append(weights, w+noiseAt(i))
	}

	smoothed, trendPerWeek := kalmanWeightFilter(dates, weights)
	fmt.Printf("\n-- gap + plateau scenario --\n")
	fmt.Printf("last smoothed: %.2f, trend after plateau: %.2f lbs/week (expect near 0)\n",
		smoothed[len(smoothed)-1], trendPerWeek)
}

func noiseAt(i int) float64 {
	pattern := []float64{0, 1.2, -0.8, 2.1, -1.5, 0.3, -0.2, 1.8, -2.3, 0.6, -0.9, 1.4}
	return pattern[i%len(pattern)]
}
