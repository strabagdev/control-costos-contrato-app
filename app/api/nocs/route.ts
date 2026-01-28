import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

function roleOf(session: any) {
  return (session?.user as any)?.role as string | undefined;
}

function canWrite(session: any) {
  const r = roleOf(session);
  return r === "admin" || r === "editor";
}

async function assertContractAccess(usuario_id: string, contrato_id: string) {
  const allow = await pool.query(
    `SELECT 1
     FROM public.user_contract
     WHERE usuario_id = $1 AND contrato_id = $2
     LIMIT 1`,
    [usuario_id, contrato_id]
  );
  return allow.rowCount > 0;
}

// GET /api/nocs?contrato_id=...
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const contrato_id = (url.searchParams.get("contrato_id") ?? "").trim();
  if (!contrato_id) return NextResponse.json({ error: "contrato_id required" }, { status: 400 });

  const ok = await assertContractAccess(usuario_id, contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { rows } = await pool.query(
    `SELECT noc_id, contrato_id, numero, motivo, fecha, created_at
     FROM public.noc
     WHERE contrato_id = $1
     ORDER BY COALESCE(fecha, created_at::date) DESC, created_at DESC`,
    [contrato_id]
  );

  return NextResponse.json({ nocs: rows });
}

// POST /api/nocs  { contrato_id, numero, motivo?, fecha? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const contrato_id = (body?.contrato_id ?? "").toString().trim();
  const numero = (body?.numero ?? "").toString().trim();
  const motivo = (body?.motivo ?? null) as string | null;
  const fecha = (body?.fecha ?? null) as string | null; // ISO date

  if (!contrato_id) return NextResponse.json({ error: "contrato_id required" }, { status: 400 });
  if (!numero) return NextResponse.json({ error: "numero required" }, { status: 400 });

  const ok = await assertContractAccess(usuario_id, contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { rows } = await pool.query(
    `INSERT INTO public.noc (contrato_id, numero, motivo, fecha)
     VALUES ($1, $2, $3, $4)
     RETURNING noc_id, contrato_id, numero, motivo, fecha, created_at`,
    [contrato_id, numero, motivo, fecha]
  );

  return NextResponse.json({ noc: rows[0] }, { status: 201 });
}
