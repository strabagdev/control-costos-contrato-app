-- 004_auth_seed.sql - Seed mínimo de usuarios (SOLO DEV)
-- Credenciales iniciales:
--   email: admin@local.test
--   password: Admin123!
-- Cambia esto después de probar.

BEGIN;

INSERT INTO usuario (email, nombre, password_hash, rol, activo)
VALUES (
  'admin@local.test',
  'Admin Local',
  crypt('Admin123!', gen_salt('bf')),
  'admin',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

COMMIT;
