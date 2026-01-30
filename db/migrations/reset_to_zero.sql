-- reset_to_zero.sql
-- Generated 2026-01-29T21:41:28.583936
-- Drops MVP objects (tables/views) to leave DB "in zero"
-- ⚠️ This will DELETE ALL DATA in these tables.

BEGIN;

-- Drop views first
DROP VIEW IF EXISTS v_partida_vigente CASCADE;
DROP VIEW IF EXISTS v_partidas_vigentes CASCADE;
DROP VIEW IF EXISTS v_partidas_por_contrato CASCADE;
DROP VIEW IF EXISTS v_noc_resumen CASCADE;

-- Drop relationship tables / dependents
DROP TABLE IF EXISTS noc_linea CASCADE;
DROP TABLE IF EXISTS partida CASCADE;
DROP TABLE IF EXISTS noc CASCADE;

-- Master data
DROP TABLE IF EXISTS unidad CASCADE;
DROP TABLE IF EXISTS grupo CASCADE;
DROP TABLE IF EXISTS subfamilia CASCADE;
DROP TABLE IF EXISTS familia CASCADE;
DROP TABLE IF EXISTS contrato CASCADE;

-- Auth
DROP TABLE IF EXISTS user_contract CASCADE;
DROP TABLE IF EXISTS usuario CASCADE;

COMMIT;

-- Optional: keep extensions as-is (recommended). If you want to remove pgcrypto too:
-- DROP EXTENSION IF EXISTS pgcrypto;
