-- 000_local_reset_mvp.sql
-- RESET + INIT completo para entorno LOCAL (MVP)
-- Incluye:
-- - DROP de tablas principales (CASCADE)
-- - Extensiones necesarias (pgcrypto)
-- - Schema base (contrato, partidas, nocs, etc.)
-- - Auth local (usuario + roles + trigger updated_at)
-- - Relación user_contract
-- - Campos NOC status + versionado de partida
-- - Seed: contrato demo + familias/subfamilias/grupos/unidades + 2 partidas + 1 NOC + 1 línea
-- - Seed: usuario admin@local.test / Admin123!
--
-- Ejecutar con:
--   psql -U postgres -d <TU_DB> -v ON_ERROR_STOP=1 -f db/migrations/000_local_reset_mvp.sql

BEGIN;

-- 0) Extensiones
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Drop (orden seguro)
DROP TABLE IF EXISTS public.noc_linea CASCADE;
DROP TABLE IF EXISTS public.partida CASCADE;
DROP TABLE IF EXISTS public.noc CASCADE;

DROP TABLE IF EXISTS public.user_contract CASCADE;
DROP TABLE IF EXISTS public.usuario CASCADE;

DROP TABLE IF EXISTS public.grupo CASCADE;
DROP TABLE IF EXISTS public.subfamilia CASCADE;
DROP TABLE IF EXISTS public.familia CASCADE;
DROP TABLE IF EXISTS public.unidad CASCADE;

DROP TABLE IF EXISTS public.contrato CASCADE;

COMMIT;

-- 2) Re-crear schema base
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


BEGIN;

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

COMMIT;

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

-- dev_seed.sql - Datos mínimos de prueba (local)

-- Contrato
INSERT INTO contrato (contrato_id, nombre, descripcion)
VALUES ('11111111-1111-1111-1111-111111111111', 'Contrato Demo', 'Contrato de prueba')
ON CONFLICT DO NOTHING;

-- Familias
INSERT INTO familia (familia_id, item, nombre)
VALUES 
 ('22222222-2222-2222-2222-222222222221', 'F1', 'Obras Civiles'),
 ('22222222-2222-2222-2222-222222222222', 'F2', 'Montaje')
ON CONFLICT DO NOTHING;

-- Subfamilias
INSERT INTO subfamilia (subfamilia_id, familia_id, item, nombre)
VALUES
 ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222221', 'SF1', 'Hormigón'),
 ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', 'SF2', 'Estructuras')
ON CONFLICT DO NOTHING;

-- Grupos
INSERT INTO grupo (grupo_id, subfamilia_id, item, nombre)
VALUES
 ('44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333331', 'G1', 'Fundaciones'),
 ('44444444-4444-4444-4444-444444444442', '33333333-3333-3333-3333-333333333332', 'G2', 'Piping')
ON CONFLICT DO NOTHING;

-- Unidades
INSERT INTO unidad (unidad_id, nombre)
VALUES
 ('55555555-5555-5555-5555-555555555551', 'm3'),
 ('55555555-5555-5555-5555-555555555552', 'kg')
ON CONFLICT DO NOTHING;

-- Partidas base
INSERT INTO partida (
  partida_id, contrato_id, item, descripcion,
  familia_id, subfamilia_id, grupo_id,
  cantidad, unidad_id, precio_unitario, vigente
) VALUES
 (
  '66666666-6666-6666-6666-666666666661',
  '11111111-1111-1111-1111-111111111111',
  '1.01',
  'Hormigón fundaciones',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333331',
  '44444444-4444-4444-4444-444444444441',
  100,
  '55555555-5555-5555-5555-555555555551',
  50,
  TRUE
 ),
 (
  '66666666-6666-6666-6666-666666666662',
  '11111111-1111-1111-1111-111111111111',
  '2.01',
  'Montaje piping',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333332',
  '44444444-4444-4444-4444-444444444442',
  200,
  '55555555-5555-5555-5555-555555555552',
  10,
  TRUE
 )
ON CONFLICT DO NOTHING;

-- NOC
INSERT INTO noc (noc_id, contrato_id, numero, motivo, fecha)
VALUES (
  '77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111',
  'NOC-001',
  'Aumento de alcance',
  CURRENT_DATE
)
ON CONFLICT DO NOTHING;

-- NOC línea (modifica partida 1)
INSERT INTO noc_linea (
  noc_linea_id, noc_id, partida_origen_id, nueva_cantidad, observacion
)
VALUES (
  '88888888-8888-8888-8888-888888888888',
  '77777777-7777-7777-7777-777777777777',
  '66666666-6666-6666-6666-666666666661',
  120,
  'Incremento de volumen'
)
ON CONFLICT DO NOTHING;


-- 004_auth_seed.sql - Seed mínimo de usuarios (SOLO DEV)
-- Credenciales iniciales:
--   email: admin@local.test
--   password: Admin123!
-- Cambia esto después de probar.


INSERT INTO usuario (email, nombre, password_hash, rol, activo)
VALUES (
  'admin@local.test',
  'Admin Local',
  crypt('Admin123!', gen_salt('bf')),
  'admin',
  TRUE
)
ON CONFLICT (email) DO NOTHING;


-- Asociar admin a todos los contratos existentes (útil para MVP)
BEGIN;

INSERT INTO public.user_contract (usuario_id, contrato_id)
SELECT u.usuario_id, c.contrato_id
FROM public.usuario u
CROSS JOIN public.contrato c
WHERE u.email = 'admin@local.test'
ON CONFLICT DO NOTHING;

COMMIT;
