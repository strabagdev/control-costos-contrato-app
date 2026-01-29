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

async function getNocOr404(noc_id: string) {
  const res = await pool.query(
    `SELECT noc_id, contrato_id, numero, motivo, fecha, status, is_dirty, applied_at, applied_by, created_at
     FROM public.noc
     WHERE noc_id = $1`,
    [noc_id]
  );
  return res.rows[0] ?? null;
}

function toOptionalString(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * GET /api/nocs/[id]
 * Devuelve el header del NOC.
 */
export async function GET(_req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const noc_id = (ctx?.params?.id ?? "").toString();
  if (!noc_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const noc = await getNocOr404(noc_id);
  if (!noc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await assertContractAccess(usuario_id, noc.contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ noc });
}

/**
 * PUT /api/nocs/[id]
 * Actualiza el header del NOC.
 *
 * Body (parcial):
 * {
 *   "numero": "NOC-001",
 *   "motivo": "....",
 *   "fecha": "YYYY-MM-DD" | null
 * }
 *
 * Nota: NO se exige contrato_id en el body; se toma desde el NOC existente.
 */
export async function PUT(req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const noc_id = (ctx?.params?.id ?? "").toString();
  if (!noc_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const current = await getNocOr404(noc_id);
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await assertContractAccess(usuario_id, current.contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const numero = toOptionalString(body?.numero);
  const motivo = toOptionalString(body?.motivo);

  // Permitir setear fecha a null explícitamente (cuando el front manda null)
  const hasFechaKey = Object.prototype.hasOwnProperty.call(body ?? {}, "fecha");
  const fechaVal = hasFechaKey ? (body?.fecha ?? null) : undefined;

  if (numero == null && motivo == null && !hasFechaKey) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  // Validación suave de formato de fecha si viene string
  if (hasFechaKey && fechaVal !== null) {
    const s = String(fechaVal);
    const okDate = /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!okDate) {
      return NextResponse.json(
        { error: "invalid fecha", hint: "Usa formato YYYY-MM-DD o null" },
        { status: 400 }
      );
    }
  }

  const { rows } = await pool.query(
    `UPDATE public.noc
     SET numero = COALESCE($2, numero),
         motivo = COALESCE($3, motivo),
         fecha  = CASE WHEN $4::boolean THEN $5::date ELSE fecha END,
         is_dirty = CASE WHEN status = 'applied' THEN true ELSE is_dirty END
     WHERE noc_id = $1
     RETURNING noc_id, contrato_id, numero, motivo, fecha, status, is_dirty, applied_at, applied_by, created_at`,
    [noc_id, numero, motivo, hasFechaKey, hasFechaKey ? fechaVal : null]
  );

  return NextResponse.json({ noc: rows[0] });
}

/**
 * DELETE /api/nocs/[id]
 * Elimina un NOC (si tu negocio lo permite). Mantengo una validación básica:
 * - solo admin/editor
 * - debe pertenecer a un contrato permitido para el usuario
 */
export async function DELETE(_req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const noc_id = (ctx?.params?.id ?? "").toString();
  if (!noc_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const current = await getNocOr404(noc_id);
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await assertContractAccess(usuario_id, current.contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Si tienes FK/constraints, puede fallar si hay líneas; en ese caso, el error quedará como 500.
  // Si prefieres, podemos validar primero y devolver 400 con un mensaje más claro.
  await pool.query("DELETE FROM public.noc WHERE noc_id = $1", [noc_id]);

  return NextResponse.json({ ok: true });
}
