-- 003_views.sql - Vistas para lectura (3 decimales)
-- Se elimina y recrea la vista para evitar conflictos de tipo

BEGIN;

DROP VIEW IF EXISTS v_partida_vigente;

CREATE VIEW v_partida_vigente AS
WITH ultima_noc_por_partida AS (
  SELECT DISTINCT ON (nl.partida_origen_id)
    nl.partida_origen_id,
    nl.noc_id,
    nl.nueva_cantidad,
    nl.nuevo_precio_unitario,
    nl.created_at
  FROM noc_linea nl
  WHERE nl.partida_origen_id IS NOT NULL
  ORDER BY nl.partida_origen_id, nl.created_at DESC
)
SELECT
  p.partida_id,
  p.contrato_id,
  p.item,
  p.descripcion,

  -- Base
  round(p.cantidad, 3)        AS cantidad_base,
  round(p.precio_unitario, 3) AS precio_unitario_base,
  round(p.total, 3)           AS total_base,

  -- Vigente
  round(COALESCE(u.nueva_cantidad, p.cantidad), 3) AS cantidad_vigente,
  round(COALESCE(u.nuevo_precio_unitario, p.precio_unitario), 3) AS precio_unitario_vigente,
  round(
    COALESCE(u.nueva_cantidad, p.cantidad)
    * COALESCE(u.nuevo_precio_unitario, p.precio_unitario),
    3
  ) AS total_vigente,

  -- Trazabilidad
  u.noc_id     AS noc_id_ultima,
  u.created_at AS noc_linea_fecha_ultima,

  -- Delta
  round(COALESCE(u.nueva_cantidad, p.cantidad) - p.cantidad, 3) AS delta_cantidad,
  round(
    (COALESCE(u.nueva_cantidad, p.cantidad)
     * COALESCE(u.nuevo_precio_unitario, p.precio_unitario)) - p.total,
    3
  ) AS delta_total

FROM partida p
LEFT JOIN ultima_noc_por_partida u
  ON u.partida_origen_id = p.partida_id;

COMMIT;
