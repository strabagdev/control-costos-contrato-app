-- 004_auth.sql - Autenticación y roles (local, compatible con Supabase Postgres)
-- Tabla: usuario
-- Roles: admin | editor | viewer
-- password_hash: bcrypt (generado con pgcrypto crypt + gen_salt('bf'))

BEGIN;

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

COMMIT;
