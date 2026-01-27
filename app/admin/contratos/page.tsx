import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import ContratosClient from "./contratos-client";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export default async function ContratosAdminPage() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) redirect("/");

  // Load contracts + dependency counts (for safer deletes + UI hints)
  const { rows } = await pool.query(
    `SELECT
       c.contrato_id,
       c.nombre,
       COALESCE(c.descripcion, '') AS descripcion,
       COALESCE(p.cnt, 0)::int AS partidas_count,
       COALESCE(n.cnt, 0)::int AS noc_count,
       COALESCE(uc.cnt, 0)::int AS user_links_count
     FROM public.contrato c
     LEFT JOIN (
       SELECT contrato_id, COUNT(*) cnt
       FROM public.partida
       GROUP BY contrato_id
     ) p ON p.contrato_id = c.contrato_id
     LEFT JOIN (
       SELECT contrato_id, COUNT(*) cnt
       FROM public.noc
       GROUP BY contrato_id
     ) n ON n.contrato_id = c.contrato_id
     LEFT JOIN (
       SELECT contrato_id, COUNT(*) cnt
       FROM public.user_contract
       GROUP BY contrato_id
     ) uc ON uc.contrato_id = c.contrato_id
     ORDER BY c.nombre`
  );

  return (
    <div style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>
        Admin · Contratos
      </h1>
      <p style={{ marginTop: 8, opacity: 0.75 }}>
        Crear/editar/eliminar contratos. El ID es UUID autogenerado (no editable).
      </p>

      <ContratosClient initialContratos={rows} />
    </div>
  );
}
