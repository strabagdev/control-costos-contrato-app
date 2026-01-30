-- bootstrap_mvp.sql
-- Generated 2026-01-29T21:41:28.583134
-- Combines core migrations for MVP (init + auth + user_contract + hardening + views)
-- Run on an empty database (or after reset_to_zero.sql)
SET client_min_messages TO WARNING;

BEGIN;

-- >>> 001_init.sql
-- 001_init.sql - Control de Costos Contrato (schema pulido)
-- PostgreSQL (local / Supabase compatible)
-- Convenciones:
-- - Tablas y columnas en español, snake_case, sin tildes
-- - PK/FK explícitas con *_id
-- - Campos propios simples: nombre, descripcion, item, etc.


-- UUID support (Postgres/Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- CONTRATO
-- =========================
CREATE TABLE IF NOT EXISTS contrato (
  contrato_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT NOT NULL,
  descripcion      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- FAMILIA / SUBFAMILIA / GRUPO
-- =========================
CREATE TABLE IF NOT EXISTS familia (
  familia_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item             TEXT,
  nombre           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_familia_nombre UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS subfamilia (
  subfamilia_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id       UUID NOT NULL REFERENCES familia(familia_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  item             TEXT,
  nombre           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subfamilia UNIQUE (familia_id, nombre)
);

CREATE TABLE IF NOT EXISTS grupo (
  grupo_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subfamilia_id    UUID NOT NULL REFERENCES subfamilia(subfamilia_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  item             TEXT,
  nombre           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grupo UNIQUE (subfamilia_id, nombre)
);

-- =========================
-- UNIDAD
-- =========================
CREATE TABLE IF NOT EXISTS unidad (
  unidad_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT NOT NULL,
  descripcion      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_unidad_nombre UNIQUE (nombre)
);

-- =========================
-- NOC (encabezado)
-- =========================
CREATE TABLE IF NOT EXISTS noc (
  noc_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id      UUID NOT NULL REFERENCES contrato(contrato_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  numero           TEXT NOT NULL,
  motivo           TEXT,
  fecha            DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_noc_numero_por_contrato UNIQUE (contrato_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_noc_contrato ON noc(contrato_id);

-- =========================
-- PARTIDA
-- =========================
CREATE TABLE IF NOT EXISTS partida (
  partida_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id          UUID NOT NULL REFERENCES contrato(contrato_id) ON UPDATE CASCADE ON DELETE RESTRICT,

  item                 TEXT NOT NULL,
  descripcion          TEXT,

  -- Clasificación (normalizada)
  familia_id           UUID REFERENCES familia(familia_id) ON UPDATE CASCADE ON DELETE SET NULL,
  subfamilia_id        UUID REFERENCES subfamilia(subfamilia_id) ON UPDATE CASCADE ON DELETE SET NULL,
  grupo_id             UUID REFERENCES grupo(grupo_id) ON UPDATE CASCADE ON DELETE SET NULL,

  -- Medición
  cantidad             NUMERIC(18,4) NOT NULL DEFAULT 0,
  unidad_id            UUID REFERENCES unidad(unidad_id) ON UPDATE CASCADE ON DELETE SET NULL,
  precio_unitario      NUMERIC(18,4) NOT NULL DEFAULT 0,

  -- Total calculado (evita inconsistencias)
  total                NUMERIC(18,4) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,

  vigente              BOOLEAN NOT NULL DEFAULT TRUE,

  -- Trazabilidad/origen (si una partida nace desde otra o desde una NOC)
  origen_tipo          TEXT,
  origen_id            UUID,

  -- Referencia rápida a NOC (opcional; la relación fuerte está en noc_linea)
  noc_id               UUID REFERENCES noc(noc_id) ON UPDATE CASCADE ON DELETE SET NULL,

  estado_operativo     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_partida_item_por_contrato UNIQUE (contrato_id, item)
);

CREATE INDEX IF NOT EXISTS idx_partida_contrato ON partida(contrato_id);
CREATE INDEX IF NOT EXISTS idx_partida_noc ON partida(noc_id);
CREATE INDEX IF NOT EXISTS idx_partida_familia ON partida(familia_id);
CREATE INDEX IF NOT EXISTS idx_partida_subfamilia ON partida(subfamilia_id);
CREATE INDEX IF NOT EXISTS idx_partida_grupo ON partida(grupo_id);
CREATE INDEX IF NOT EXISTS idx_partida_unidad ON partida(unidad_id);

-- =========================
-- NOC LINEA (detalle)
-- =========================
CREATE TABLE IF NOT EXISTS noc_linea (
  noc_linea_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  noc_id                UUID NOT NULL REFERENCES noc(noc_id) ON UPDATE CASCADE ON DELETE CASCADE,

  partida_origen_id     UUID REFERENCES partida(partida_id) ON UPDATE CASCADE ON DELETE SET NULL,
  partida_resultante_id UUID REFERENCES partida(partida_id) ON UPDATE CASCADE ON DELETE SET NULL,

  nueva_cantidad        NUMERIC(18,4),
  nuevo_precio_unitario NUMERIC(18,4),

  observacion           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_noc_linea_noc ON noc_linea(noc_id);
-- >>> 004_auth.sql
-- 004_auth.sql - Autenticación y roles (local, compatible con Supabase Postgres)
-- Tabla: usuario
-- Roles: admin | editor | viewer
-- password_hash: bcrypt (generado con pgcrypto crypt + gen_salt('bf'))


CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuario (
  usuario_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  nombre         TEXT,
  password_hash  TEXT NOT NULL,
  rol            TEXT NOT NULL CHECK (rol IN ('admin','editor','viewer')),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_usuario_email UNIQUE (email)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuario_updated_at ON usuario;
CREATE TRIGGER trg_usuario_updated_at
BEFORE UPDATE ON usuario
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
-- >>> 20260126_create_user_contract.sql
-- 20260126_create_user_contract.sql
-- Relación usuario ↔ contrato
-- Tablas reales:
--   public.usuario(usuario_id)
--   public.contrato(contrato_id)

CREATE TABLE IF NOT EXISTS user_contract (
  usuario_id UUID NOT NULL REFERENCES public.usuario(usuario_id) ON DELETE CASCADE,
  contrato_id UUID NOT NULL REFERENCES public.contrato(contrato_id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, contrato_id)
);
-- >>> 010_hardening_partida_unique_and_uuid.sql
-- 010_hardening_partida_unique_and_uuid.sql
-- Objetivo:
-- 1) Asegurar gen_random_uuid() (pgcrypto)
-- 2) Permitir versionado de partidas (múltiples versiones por item) manteniendo unicidad SOLO en vigentes
--    (RN-11/RN-12)
-- 3) Evitar errores de "relation ... does not exist" por search_path: usar schema public explícito en lo nuevo
--
-- Ejecutar con:
--   psql -U postgres -d <TU_DB> -v ON_ERROR_STOP=1 -f db/migrations/010_hardening_partida_unique_and_uuid.sql


-- 1) UUID default helper
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Reemplazar UNIQUE (contrato_id, item) por UNIQUE PARCIAL solo para vigentes
--    Esto habilita RN-04 (nueva instancia) sin perder RN-12 (una vigente por item).
DO $$
BEGIN
  -- Drop constraint if exists (nombre exacto según tu init)
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_partida_item_por_contrato'
      AND conrelid = 'public.partida'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE public.partida DROP CONSTRAINT uq_partida_item_por_contrato';
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- Si la tabla aún no existe en esta DB, no fallar
  RAISE NOTICE 'public.partida no existe todavía; omitiendo hardening de constraint.';
END $$;

-- Crear índice único parcial (si la tabla existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name='partida'
  ) THEN
    EXECUTE '
      CREATE UNIQUE INDEX IF NOT EXISTS uq_partida_item_vigente_por_contrato
      ON public.partida (contrato_id, item)
      WHERE vigente = true
    ';
  END IF;
END $$;

-- 3) Índices de apoyo (opcionales pero recomendados)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='noc_linea') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_noc_linea_noc_id ON public.noc_linea (noc_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_noc_linea_partida_origen_id ON public.noc_linea (partida_origen_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_noc_linea_partida_resultante_id ON public.noc_linea (partida_resultante_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='partida') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_partida_contrato_id ON public.partida (contrato_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_partida_noc_id ON public.partida (noc_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS ix_partida_vigente ON public.partida (vigente)';
  END IF;
END $$;
-- >>> 003_views.sql
-- 003_views.sql - Vistas para lectura (3 decimales)
-- Se elimina y recrea la vista para evitar conflictos de tipo


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
