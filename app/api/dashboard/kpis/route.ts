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
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const contrato_id = (url.searchParams.get("contrato_id") ?? "").trim();
  if (!contrato_id) return NextResponse.json({ error: "contrato_id required" }, { status: 400 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // AuthZ: user must be assigned to the contract
  const allow = await pool.query(
    "SELECT 1 FROM public.user_contract WHERE usuario_id = $1 AND contrato_id = $2 LIMIT 1",
    [usuario_id, contrato_id]
  );

  if (allow.rowCount === 0) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // KPIs
  const baseAndVigente = await pool.query(
    `SELECT
       COALESCE(SUM(total) FILTER (WHERE noc_id IS NULL), 0) AS total_base,
       COALESCE(SUM(total) FILTER (WHERE vigente = true), 0) AS total_vigente
     FROM public.partida
     WHERE contrato_id = $1`,
    [contrato_id]
  );

  const nocCount = await pool.query(
    "SELECT COUNT(*)::int AS noc_count FROM public.noc WHERE contrato_id = $1",
    [contrato_id]
  );

  const total_base = baseAndVigente.rows[0]?.total_base ?? 0;
  const total_vigente = baseAndVigente.rows[0]?.total_vigente ?? 0;

  // delta in SQL-ish but safe in JS too (these may come as string)
  const toNum = (v: any) => (typeof v === "number" ? v : parseFloat(String(v ?? 0)));
  const delta = toNum(total_vigente) - toNum(total_base);

  return NextResponse.json({
    contrato_id,
    total_base,
    total_vigente,
    delta,
    noc_count: nocCount.rows[0]?.noc_count ?? 0,
  });
}
