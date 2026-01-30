-- seed_current_mvp.sql
-- Seed coherente con el estado actual del MVP (sin NOC apply / versionado)
-- Basado en:
-- 002_seed.sql
-- 004_auth_seed.sql
-- 010_demo_contracts_and_partidas.sql

BEGIN;

-- =========================
-- USUARIOS
-- =========================
INSERT INTO public.usuario (email, nombre, password_hash, rol, activo)
VALUES
  (
    'admin@local.test',
    'Administrador',
    crypt('Admin123!', gen_salt('bf')),
    'admin',
    true
  )
ON CONFLICT (email) DO NOTHING;

-- =========================
-- CONTRATOS DEMO
-- =========================
INSERT INTO public.contrato (contrato_id, nombre, descripcion)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Contrato Demo 1', 'Contrato de prueba principal'),
  ('22222222-2222-2222-2222-222222222222', 'Contrato Demo 2', 'Contrato de prueba secundario')
ON CONFLICT (contrato_id) DO NOTHING;

-- =========================
-- ASIGNACIÓN USUARIO ↔ CONTRATO
-- =========================
INSERT INTO public.user_contract (usuario_id, contrato_id)
SELECT u.usuario_id, c.contrato_id
FROM public.usuario u
JOIN public.contrato c ON true
WHERE u.email = 'admin@local.test'
ON CONFLICT DO NOTHING;

-- =========================
-- PARTIDAS DEMO (vigentes)
-- =========================
INSERT INTO public.partida (
  partida_id,
  contrato_id,
  item,
  descripcion,
  cantidad,
  precio_unitario,
  vigente
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'ITEM-001',
    'Movimiento de tierra',
    100,
    10,
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    'ITEM-002',
    'Hormigón',
    50,
    20,
    true
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '22222222-2222-2222-2222-222222222222',
    'ITEM-003',
    'Montaje estructura',
    30,
    40,
    true
  )
ON CONFLICT (partida_id) DO NOTHING;

COMMIT;
