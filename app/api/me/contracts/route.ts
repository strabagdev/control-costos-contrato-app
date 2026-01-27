import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

type ColInfo = { column_name: string };

async function getUsuarioColumnMap() {
  const { rows } = await pool.query<ColInfo>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'usuario'`
  );

  const cols = new Set(rows.map((r) => r.column_name));

  const idCol = cols.has("usuario_id") ? "usuario_id" : cols.has("id") ? "id" : null;
  const emailCol = cols.has("email") ? "email" : null;

  if (!idCol || !emailCol) throw new Error("public.usuario: columnas requeridas no encontradas");

  return { idCol, emailCol };
}

async function resolveUsuarioId(session: any): Promise<string | null> {
  // Try common shapes first
  const direct =
    (session?.user as any)?.id ||
    (session?.user as any)?.usuario_id ||
    (session as any)?.user_id;

  if (direct && typeof direct === "string") return direct;

  const email = session?.user?.email;
  if (!email) return null;

  const map = await getUsuarioColumnMap();
  const { rows } = await pool.query(
    `SELECT ${map.idCol} AS usuario_id
     FROM public.usuario
     WHERE ${map.emailCol} = $1
     LIMIT 1`,
    [email]
  );

  return rows[0]?.usuario_id ?? null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ contratos: [] });

  const { rows } = await pool.query(
    `SELECT c.contrato_id, c.nombre
     FROM public.user_contract uc
     JOIN public.contrato c ON c.contrato_id = uc.contrato_id
     WHERE uc.usuario_id = $1
     ORDER BY c.nombre`,
    [usuario_id]
  );

  return NextResponse.json({ contratos: rows });
}
