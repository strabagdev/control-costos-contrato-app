-- Migration: NOC state + apply changes (minimal)
-- Adds: status, is_dirty, applied_at, applied_by
-- Note: applied_by stored as TEXT for compatibility with usuario_id being uuid or text.

ALTER TABLE public.noc
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS is_dirty BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS applied_by TEXT NULL;

-- Optional: index for filtering in admin lists
CREATE INDEX IF NOT EXISTS idx_noc_contrato_status ON public.noc (contrato_id, status);
