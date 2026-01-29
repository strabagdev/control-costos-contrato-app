-- seed_admin.sql
-- Crea usuario admin local (si no existe) y lo asocia a todos los contratos existentes.

BEGIN;

-- 1) Crear admin si no existe
WITH ins AS (
  INSERT INTO public.usuario (email, nombre, password_hash, rol, activo)
  SELECT
    'admin@local.test' AS email,
    'Admin' AS nombre,
    crypt('Admin123!', gen_salt('bf')) AS password_hash,
    'admin' AS rol,
    TRUE AS activo
  WHERE NOT EXISTS (
    SELECT 1 FROM public.usuario WHERE email = 'admin@local.test'
  )
  RETURNING usuario_id
)
SELECT 1;

-- 2) Asociar admin a todos los contratos existentes
INSERT INTO public.user_contract (usuario_id, contrato_id)
SELECT u.usuario_id, c.contrato_id
FROM public.usuario u
CROSS JOIN public.contrato c
WHERE u.email = 'admin@local.test'
ON CONFLICT DO NOTHING;

COMMIT;
