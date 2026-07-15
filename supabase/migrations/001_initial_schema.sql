-- ============================================================
-- PERIGEE SCHEMA v2 — initial migration
-- Source of truth: TRELLIS_Spec_v2_Corrected.md (Part 1.1 + 2.5)
-- Run this in the Supabase SQL Editor (or via supabase db push).
-- ============================================================

-- ---------- profiles (app-level user data; auth.users is owned by Supabase Auth) ----------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  daily_calorie_budget INTEGER NOT NULL DEFAULT 1800,
  week_start_day SMALLINT NOT NULL DEFAULT 0,  -- 0=Sunday, 1=Monday
  weight_goal_lbs NUMERIC(5,1),
  goal_date DATE,
  height_in NUMERIC(5,1),
  onboarded_at TIMESTAMPTZ,
  avatar_path TEXT,
  protein_target_g NUMERIC(6,1),
  carbs_target_g NUMERIC(6,1),
  fat_target_g NUMERIC(6,1),
  fiber_target_g NUMERIC(6,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create a profile row whenever Supabase Auth creates a user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- weight_logs ----------
CREATE TABLE public.weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_lbs NUMERIC(5,1) NOT NULL CHECK (weight_lbs > 0 AND weight_lbs < 1500),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- ---------- relationships (partner connect) ----------
CREATE TABLE public.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

-- ---------- recipes ----------
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_calories INTEGER NOT NULL CHECK (total_calories >= 0),
  protein NUMERIC(7,2) NOT NULL DEFAULT 0,
  carbs NUMERIC(7,2) NOT NULL DEFAULT 0,
  fat NUMERIC(7,2) NOT NULL DEFAULT 0,
  fiber NUMERIC(7,2) NOT NULL DEFAULT 0,
  servings NUMERIC(4,1) NOT NULL DEFAULT 1,
  ingredients JSONB NOT NULL DEFAULT '[]',
  share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- recipe_shares ----------
CREATE TABLE public.recipe_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  shared_to UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, shared_to)
);

-- ---------- food_logs ----------
CREATE TABLE public.food_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack','drink')),
  source TEXT NOT NULL CHECK (source IN ('manual','photo','recipe','barcode','repeat','shared')),
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  photo_path TEXT,             -- Supabase Storage path, not URL
  detected_food TEXT,
  name TEXT NOT NULL,
  calories INTEGER NOT NULL CHECK (calories >= 0 AND calories <= 10000),
  protein NUMERIC(7,2) NOT NULL DEFAULT 0,
  carbs NUMERIC(7,2) NOT NULL DEFAULT 0,
  fat NUMERIC(7,2) NOT NULL DEFAULT 0,
  fiber NUMERIC(7,2) NOT NULL DEFAULT 0,
  serving_grams NUMERIC(7,1),  -- barcode serving size
  ai_confidence TEXT CHECK (ai_confidence IN ('low','medium','high')),
  user_adjusted BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- activity_logs ----------
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  steps INTEGER CHECK (steps >= 0 AND steps <= 200000),
  workout_type TEXT,
  workout_minutes INTEGER CHECK (workout_minutes >= 0),
  calories_burned INTEGER NOT NULL DEFAULT 0 CHECK (calories_burned >= 0 AND calories_burned <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- ---------- coach_checkins ----------
CREATE TABLE public.coach_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  user_mood TEXT,
  stats_snapshot JSONB,
  coach_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- ---------- coach_messages (interactive chat, distinct from the once-a-day
-- coach_checkins mood check-in) ----------
CREATE TABLE public.coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- indexes (separate statements — inline INDEX is invalid in Postgres) ----------
CREATE INDEX idx_food_logs_user_date   ON public.food_logs (user_id, date DESC);
CREATE INDEX idx_weight_logs_user_date ON public.weight_logs (user_id, date DESC);
CREATE INDEX idx_activity_user_date    ON public.activity_logs (user_id, date DESC);
CREATE INDEX idx_recipes_creator       ON public.recipes (creator_id);
CREATE INDEX idx_shares_shared_to      ON public.recipe_shares (shared_to, status);
CREATE INDEX idx_coach_messages_user_date ON public.coach_messages (user_id, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- Defense in depth: the Go backend uses the service role (bypasses RLS),
-- but if the anon key is ever used client-side, these policies are the wall.
-- ============================================================
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_shares  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

-- ---------- profiles: own row only (keyed on id, not user_id) ----------
CREATE POLICY "own profile select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- No INSERT/DELETE policies: rows are created by the signup trigger and
-- deleted by the auth.users ON DELETE CASCADE.

-- ---------- simple user-owned tables: full access to own rows ----------
CREATE POLICY "own rows" ON public.food_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own rows" ON public.weight_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own rows" ON public.activity_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own rows" ON public.coach_checkins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own rows" ON public.coach_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- relationships: both parties can see; requester creates;
--            addressee responds; either party can delete ----------
CREATE POLICY "parties can view" ON public.relationships
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "requester can create" ON public.relationships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "addressee can respond" ON public.relationships
  FOR UPDATE USING (auth.uid() = addressee_id) WITH CHECK (auth.uid() = addressee_id);

CREATE POLICY "parties can remove" ON public.relationships
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ---------- recipes: creator has full access; recipients of an accepted
--            share can read. (Public share_token links are resolved by the
--            Go backend via service role, so no anon policy is needed.) ----------
CREATE POLICY "creator full access" ON public.recipes
  FOR ALL USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "shared recipes readable" ON public.recipes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.recipe_shares rs
      WHERE rs.recipe_id = recipes.id
        AND rs.shared_to = auth.uid()
        AND rs.status = 'accepted'
    )
  );

-- ---------- recipe_shares: creator shares out; recipient sees + accepts;
--            either side can remove the share ----------
CREATE POLICY "share parties can view" ON public.recipe_shares
  FOR SELECT USING (
    auth.uid() = shared_to
    OR EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_shares.recipe_id AND r.creator_id = auth.uid()
    )
  );

CREATE POLICY "creator can share" ON public.recipe_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_shares.recipe_id AND r.creator_id = auth.uid()
    )
  );

CREATE POLICY "recipient can respond" ON public.recipe_shares
  FOR UPDATE USING (auth.uid() = shared_to) WITH CHECK (auth.uid() = shared_to);

CREATE POLICY "share parties can remove" ON public.recipe_shares
  FOR DELETE USING (
    auth.uid() = shared_to
    OR EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_shares.recipe_id AND r.creator_id = auth.uid()
    )
  );
