-- ============================================================
-- Accountability features: recipe tags/favorites, partner pokes,
-- weight-goal milestones. Run in the Supabase SQL Editor (or
-- via supabase db push).
-- ============================================================

-- ---------- recipes: tags (free-form, GIN-indexed for filtering) ----------
ALTER TABLE public.recipes ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX idx_recipes_tags ON public.recipes USING GIN (tags);

-- ---------- recipe_favorites (per-user; a recipe can be favorited by its
-- creator or by a partner it was shared with, so this can't be a column on
-- recipes without leaking one user's favorite state to the other) ----------
CREATE TABLE public.recipe_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, recipe_id)
);
CREATE INDEX idx_recipe_favorites_user ON public.recipe_favorites (user_id);

-- ---------- pokes (partner accountability nudge; the UNIQUE constraint on
-- sender/recipient/date IS the 1-per-day-per-direction cooldown) ----------
CREATE TABLE public.pokes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sender_id, recipient_id, date)
);
CREATE INDEX idx_pokes_recipient ON public.pokes (recipient_id, created_at DESC);

-- ---------- milestones_seen (tracks which weight-goal milestones have
-- already been celebrated, so they don't re-fire on every page load) ----------
CREATE TABLE public.milestones_seen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, milestone_key)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.recipe_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pokes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones_seen  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows" ON public.recipe_favorites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own rows" ON public.milestones_seen
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "parties can view" ON public.pokes
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "sender can create" ON public.pokes
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
