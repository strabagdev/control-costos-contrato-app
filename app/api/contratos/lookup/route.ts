import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

  if (!idCol || !emailCol) throw new Error("public.usuario: columnas requeridas no encontradas");
  return { idCol, emailCol };
}

async function resolveUsuarioId(session: any): Promise<string | null> {
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

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const contrato = (url.searchParams.get("contrato") ?? "").toString();

  if (!contrato || !isUuid(contrato)) {
    return NextResponse.json({ error: "invalid contrato" }, { status: 400 });
  }

  // Admin can see any contract; non-admin must be assigned via user_contract
  if (!isAdmin(session)) {
    const usuario_id = await resolveUsuarioId(session);
    if (!usuario_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { rows: allowed } = await pool.query(
      `SELECT 1
       FROM public.user_contract
       WHERE usuario_id = $1::uuid AND contrato_id = $2::uuid
       LIMIT 1`,
      [usuario_id, contrato]
    );

    if (!allowed[0]) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { rows } = await pool.query(
    `SELECT contrato_id, nombre
     FROM public.contrato
     WHERE contrato_id = $1::uuid
     LIMIT 1`,
    [contrato]
  );

  const c = rows[0];
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ contrato: c });
}
