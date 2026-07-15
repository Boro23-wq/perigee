package handlers

import "time"

// kalmanWeightFilter treats true body weight as a slowly-drifting hidden
// state (fat loss/gain is physically gradual) observed through a noisy
// daily measurement (water, sodium, glycogen, gut contents). It's the same
// class of filter Happy Scale and similar trend-weight tools use — strictly
// better than a trailing simple moving average because:
//   - it updates from the very first data point instead of needing a full
//     window to fill,
//   - every point is weighted by how much it disagrees with the trend so
//     far, not treated equally regardless of age,
//   - there's no hard window edge, so an old outlier never "drops off" and
//     causes the average to visibly jump.
//
// State vector is [weight, trendPerDay]. measurementNoise is the assumed
// variance of day-to-day non-fat weight swings (~1.5lb stdev is typical);
// processNoise controls how fast the estimated trend itself is allowed to
// drift day to day — small, since real fat-loss rate changes slowly.
const (
	kalmanMeasurementNoise = 1.5 * 1.5
	kalmanProcessNoise     = 0.02 * 0.02
)

// kalmanWeightFilter returns one smoothed weight per input entry (same
// order) and the final trend estimate in lbs/week.
func kalmanWeightFilter(dates []time.Time, weights []float64) (smoothed []float64, trendPerWeek float64) {
	n := len(weights)
	smoothed = make([]float64, n)
	if n == 0 {
		return smoothed, 0
	}

	x0 := weights[0] // estimated true weight
	x1 := 0.0        // estimated trend, lbs/day
	// Initial covariance: fairly confident about the starting weight itself
	// (it's a real measurement), very unsure about the trend (no data yet).
	p00, p01, p11 := 1.0, 0.0, 0.25

	smoothed[0] = x0

	for i := 1; i < n; i++ {
		dt := dates[i].Sub(dates[i-1]).Hours() / 24
		if dt <= 0 {
			dt = 1
		}

		// Predict.
		x0Pred := x0 + x1*dt
		x1Pred := x1

		q := kalmanProcessNoise
		q00 := q * dt * dt * dt / 3
		q01 := q * dt * dt / 2
		q11 := q * dt

		p00Pred := p00 + 2*dt*p01 + dt*dt*p11 + q00
		p01Pred := p01 + dt*p11 + q01
		p10Pred := p01Pred // symmetric
		p11Pred := p11 + q11

		// Update against this weigh-in.
		innovation := weights[i] - x0Pred
		s := p00Pred + kalmanMeasurementNoise
		k0 := p00Pred / s
		k1 := p10Pred / s

		x0 = x0Pred + k0*innovation
		x1 = x1Pred + k1*innovation

		p00 = (1 - k0) * p00Pred
		p01 = (1 - k0) * p01Pred
		p11 = p11Pred - k1*p01Pred

		smoothed[i] = x0
	}

	return smoothed, x1 * 7
}
