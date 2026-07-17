-- ============================================================
-- One row per workout instead of one row per day — activity_logs'
-- (user_id, date) UNIQUE constraint meant a second workout the same day
-- silently overwrote the first. workout_type/workout_minutes/calories_burned
-- on activity_logs are left in place (unused going forward, not dropped) so
-- existing rows aren't destroyed; they're backfilled into workout_logs below.
-- activity_logs itself keeps tracking steps, which genuinely is a once-a-day
-- figure.
-- Run after 005_food_search_source.sql.
-- ============================================================
CREATE TABLE public.workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  minutes INTEGER CHECK (minutes >= 0),
  calories_burned INTEGER NOT NULL DEFAULT 0 CHECK (calories_burned >= 0 AND calories_burned <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workout_logs_user_date ON public.workout_logs (user_id, date DESC);

ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON public.workout_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Backfill: each existing activity_logs row with workout data becomes one
-- legacy workout_logs entry, so past weeks' burn numbers don't zero out.
INSERT INTO public.workout_logs (user_id, date, name, minutes, calories_burned, created_at)
SELECT user_id, date, COALESCE(workout_type, 'Workout'), workout_minutes, calories_burned, created_at
FROM public.activity_logs
WHERE workout_type IS NOT NULL OR calories_burned > 0;
