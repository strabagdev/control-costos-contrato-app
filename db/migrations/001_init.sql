-- 001_init.sql - Control de Costos Contrato (schema pulido)
-- PostgreSQL (local / Supabase compatible)
-- Convenciones:
-- - Tablas y columnas en español, snake_case, sin tildes
-- - PK/FK explícitas con *_id
-- - Campos propios simples: nombre, descripcion, item, etc.

BEGIN;

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

COMMIT;
