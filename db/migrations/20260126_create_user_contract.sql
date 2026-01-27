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
