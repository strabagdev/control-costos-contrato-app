-- Crea la vista que usa /dev/db-check
-- Safe to run multiple times
CREATE OR REPLACE VIEW public.v_partida_vigente AS
SELECT
  p.partida_id,
  p.contrato_id,
  p.item,
  p.descripcion,
  p.familia_id,
  p.subfamilia_id,
  p.grupo_id,
  p.unidad_id,
  p.cantidad,
  p.precio_unitario,
  p.total,
  p.vigente,
  p.noc_id,
  p.created_at
FROM public.partida p
WHERE p.vigente = true;
