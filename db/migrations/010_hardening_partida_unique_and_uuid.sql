-- 010_hardening_partida_unique_and_uuid.sql
-- Objetivo:
-- 1) Asegurar gen_random_uuid() (pgcrypto)
-- 2) Permitir versionado de partidas (múltiples versiones por item) manteniendo unicidad SOLO en vigentes
--    (RN-11/RN-12)
-- 3) Evitar errores de "relation ... does not exist" por search_path: usar schema public explícito en lo nuevo
--
-- Ejecutar con:
--   psql -U postgres -d <TU_DB> -v ON_ERROR_STOP=1 -f db/migrations/010_hardening_partida_unique_and_uuid.sql

BEGIN;

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

COMMIT;
