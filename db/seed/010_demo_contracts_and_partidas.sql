-- 010_demo_contracts_and_partidas.sql
-- Seed mínimo para probar dashboard multi-contrato y KPIs.
-- Nota: NO toca usuarios. Solo contratos + partidas.
--
-- Ejecutar con:
--   psql -U postgres -d <TU_DB> -v ON_ERROR_STOP=1 -f db/seeds/010_demo_contracts_and_partidas.sql

BEGIN;

-- Crear 2 contratos si no existen (por nombre)
WITH c AS (
  INSERT INTO public.contrato (nombre, descripcion)
  SELECT 'Contrato A (demo)', 'Contrato de prueba A'
  WHERE NOT EXISTS (SELECT 1 FROM public.contrato WHERE nombre = 'Contrato A (demo)')
  RETURNING contrato_id
),
c2 AS (
  INSERT INTO public.contrato (nombre, descripcion)
  SELECT 'Contrato B (demo)', 'Contrato de prueba B'
  WHERE NOT EXISTS (SELECT 1 FROM public.contrato WHERE nombre = 'Contrato B (demo)')
  RETURNING contrato_id
)
SELECT 1;

-- Tomar IDs (existentes o insertados)
WITH ca AS (
  SELECT contrato_id FROM public.contrato WHERE nombre='Contrato A (demo)' LIMIT 1
),
cb AS (
  SELECT contrato_id FROM public.contrato WHERE nombre='Contrato B (demo)' LIMIT 1
)
-- Insertar partidas base demo solo si aún no existen por item + contrato (vigente)
INSERT INTO public.partida (
  contrato_id, item, descripcion, familia_id, subfamilia_id, grupo_id, unidad_id,
  cantidad, precio_unitario, vigente, noc_id, origen_tipo, origen_id, estado_operativo
)
SELECT
  ca.contrato_id,
  x.item,
  x.descripcion,
  x.familia_id,
  x.subfamilia_id,
  x.grupo_id,
  x.unidad_id,
  x.cantidad,
  x.precio_unitario,
  true,
  NULL,
  'import',
  NULL,
  'vigente'
FROM ca
JOIN (
  VALUES
    ('1.01', 'Partida demo A-1', NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, 10::numeric, 1000::numeric),
    ('1.02', 'Partida demo A-2', NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, 5::numeric, 2000::numeric)
) AS x(item, descripcion, familia_id, subfamilia_id, grupo_id, unidad_id, cantidad, precio_unitario)
ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.partida p
  WHERE p.contrato_id = ca.contrato_id
    AND p.item = x.item
    AND p.vigente = true
);

-- Partidas para Contrato B
WITH cb AS (
  SELECT contrato_id FROM public.contrato WHERE nombre='Contrato B (demo)' LIMIT 1
)
INSERT INTO public.partida (
  contrato_id, item, descripcion, familia_id, subfamilia_id, grupo_id, unidad_id,
  cantidad, precio_unitario, vigente, noc_id, origen_tipo, origen_id, estado_operativo
)
SELECT
  cb.contrato_id,
  x.item,
  x.descripcion,
  x.familia_id,
  x.subfamilia_id,
  x.grupo_id,
  x.unidad_id,
  x.cantidad,
  x.precio_unitario,
  true,
  NULL,
  'import',
  NULL,
  'vigente'
FROM cb
JOIN (
  VALUES
    ('2.01', 'Partida demo B-1', NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, 3::numeric, 5000::numeric)
) AS x(item, descripcion, familia_id, subfamilia_id, grupo_id, unidad_id, cantidad, precio_unitario)
ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.partida p
  WHERE p.contrato_id = cb.contrato_id
    AND p.item = x.item
    AND p.vigente = true
);

COMMIT;
