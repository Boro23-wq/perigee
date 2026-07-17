-- ============================================================
-- Allow 'search' as a food_logs.source (FatSecret food search).
-- Run after 004_feedback.sql.
-- ============================================================
ALTER TABLE public.food_logs DROP CONSTRAINT food_logs_source_check;
ALTER TABLE public.food_logs ADD CONSTRAINT food_logs_source_check
  CHECK (source IN ('manual','photo','recipe','barcode','repeat','shared','search'));
