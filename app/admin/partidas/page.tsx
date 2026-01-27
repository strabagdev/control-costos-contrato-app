import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";
import PartidasAdminClient from "./_components/PartidasAdminClient";

type SimpleOption = { id: string; label: string };

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

async function getOptions(table: string, idCol: string, labelCol: string): Promise<SimpleOption[]> {
  // NOTE: This assumes your master tables follow the common pattern:
  // table: familia/subfamilia/grupo/unidad/contrato
  // columns: <table>_id and nombre (or labelCol)
  const { rows } = await pool.query(
    `SELECT ${idCol} AS id, ${labelCol} AS label
     FROM ${table}
     ORDER BY ${labelCol} ASC`
  );
  return rows;
}

export default async function PartidasAdminPage() {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");
  if (!isAdmin(session)) redirect("/");

  // These queries assume your schema has these tables/columns:
  // contrato(contrato_id, nombre), familia(familia_id, nombre), subfamilia(subfamilia_id, nombre),
  // grupo(grupo_id, nombre), unidad(unidad_id, nombre)
  //
  // If any table/column differs, adjust here (server-side only).
  const [contratos, familias, subfamilias, grupos, unidades] = await Promise.all([
    getOptions("contrato", "contrato_id", "nombre"),
    getOptions("familia", "familia_id", "nombre"),
    getOptions("subfamilia", "subfamilia_id", "nombre"),
    getOptions("grupo", "grupo_id", "nombre"),
    getOptions("unidad", "unidad_id", "nombre"),
  ]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Admin • Partidas</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Carga y mantención de partidas base (solo admin). El flujo operacional vía NOC se implementa después.
      </p>

      <PartidasAdminClient
        contratos={contratos}
        familias={familias}
        subfamilias={subfamilias}
        grupos={grupos}
        unidades={unidades}
      />
    </div>
  );
}
