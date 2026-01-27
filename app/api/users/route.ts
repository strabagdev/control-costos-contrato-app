import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

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
  const nameCol = cols.has("nombre") ? "nombre" : cols.has("name") ? "name" : null;
  const activeCol = cols.has("activo") ? "activo" : cols.has("active") ? "active" : null;
  const roleCol = cols.has("rol") ? "rol" : cols.has("role") ? "role" : null;

  if (!idCol || !emailCol) {
    throw new Error("public.usuario: columnas requeridas no encontradas");
  }

  return { idCol, emailCol, nameCol, activeCol, roleCol };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const map = await getUsuarioColumnMap();

  const selectParts: string[] = [];
  selectParts.push(`${map.idCol} AS usuario_id`);
  selectParts.push(`${map.emailCol} AS email`);
  if (map.nameCol) selectParts.push(`${map.nameCol} AS name`);
  if (map.roleCol) selectParts.push(`${map.roleCol} AS role`);
  if (map.activeCol) selectParts.push(`${map.activeCol} AS active`);

  const where = map.activeCol ? `WHERE ${map.activeCol} = true` : "";
  const order = `ORDER BY ${map.emailCol} ASC`;

  const { rows } = await pool.query(
    `SELECT ${selectParts.join(", ")} FROM public.usuario ${where} ${order}`
  );

  return NextResponse.json({ users: rows });
}
