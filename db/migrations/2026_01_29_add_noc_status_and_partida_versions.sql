-- Migration: NOC state + Partida version chain
-- Adds minimal fields to support:
-- - NOC status/is_dirty/applied_at/applied_by
-- - Partida versioning (prev/root) to list chains and support re-apply safely

-- 1) NOC fields
ALTER TABLE public.noc
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS is_dirty BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS applied_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_noc_contrato_status ON public.noc (contrato_id, status);

-- 2) Partida version fields
ALTER TABLE public.partida
  ADD COLUMN IF NOT EXISTS version_prev_id UUID NULL,
  ADD COLUMN IF NOT EXISTS version_root_id UUID NULL;

-- Backfill root id for existing rows (best-effort)
UPDATE public.partida
SET version_root_id = COALESCE(version_root_id, partida_id)
WHERE version_root_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_partida_version_root ON public.partida (version_root_id);
CREATE INDEX IF NOT EXISTS idx_partida_version_prev ON public.partida (version_prev_id);
