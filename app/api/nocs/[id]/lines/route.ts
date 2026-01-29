import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type ColInfo = { column_name: string };

/**
 * Next.js (App Router) params helper
 * - In newer Next versions, ctx.params can be a Promise.
 * - Also, the dynamic segment name may not be [id] (e.g. [noc_id]).
 * This helper safely extracts the noc id from any of those cases.
 */
async function getRouteId(ctx: any): Promise<string> {
  const rawParams = ctx?.params;
  const params = rawParams && typeof rawParams.then === "function" ? await rawParams : rawParams;

  const direct =
    params?.id ??
    params?.noc_id ??
    params?.nocId ??
    params?.nocID ??
    params?.noc;

  if (direct) return String(direct);

  // Fallback: if there is exactly 1 param key, use its value
  if (params && typeof params === "object") {
    const keys = Object.keys(params);
    if (keys.length === 1) return String((params as any)[keys[0]]);
  }

  return "";
}

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
  const res = await pool.query("SELECT noc_id, contrato_id FROM public.noc WHERE noc_id = $1", [noc_id]);
  return res.rows[0] ?? null;
}

async function markNocDirtyIfApplied(noc_id: string) {
  // Si la NOC ya estaba aplicada, cualquier cambio en líneas deja cambios pendientes
  await pool.query(
    `UPDATE public.noc
     SET is_dirty = CASE WHEN status = 'applied' THEN true ELSE is_dirty END
     WHERE noc_id = $1`,
    [noc_id]
  );
}


/**
 * Helpers
 */
function toOptionalString(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toOptionalNumber(v: any): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Body normalization:
 * - Accepts both legacy keys (partida_id, cantidad, precio_unitario)
 *   and current keys (partida_origen_id, nueva_cantidad, nuevo_precio_unitario).
 */
function normalizeLineBody(body: any) {
  const partida_origen_id =
    toOptionalString(body?.partida_origen_id) ?? toOptionalString(body?.partida_id);

  const nueva_cantidad =
    body?.nueva_cantidad != null ? toOptionalNumber(body.nueva_cantidad) : toOptionalNumber(body?.cantidad);

  const nuevo_precio_unitario =
    body?.nuevo_precio_unitario != null
      ? toOptionalNumber(body.nuevo_precio_unitario)
      : toOptionalNumber(body?.precio_unitario);

  const observacion = toOptionalString(body?.observacion);

  return { partida_origen_id, nueva_cantidad, nuevo_precio_unitario, observacion };
}

// GET /api/nocs/[id]/lines
export async function GET(_req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const noc_id = await getRouteId(ctx);
  if (!noc_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const noc = await getNocOr404(noc_id);
  if (!noc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await assertContractAccess(usuario_id, noc.contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { rows } = await pool.query(
    `SELECT
       nl.noc_linea_id,
       nl.noc_id,
       nl.partida_origen_id,
       nl.partida_resultante_id,
       nl.nueva_cantidad,
       nl.nuevo_precio_unitario,
       nl.observacion,
       nl.created_at,

       p.item AS origen_item,
       p.descripcion AS origen_descripcion,
       p.cantidad AS origen_cantidad,
       p.precio_unitario AS origen_precio_unitario,
       p.total AS origen_total,
       p.vigente AS origen_vigente
     FROM public.noc_linea nl
     LEFT JOIN public.partida p ON p.partida_id = nl.partida_origen_id
     WHERE nl.noc_id = $1
     ORDER BY nl.created_at ASC`,
    [noc_id]
  );

  return NextResponse.json({ lines: rows });
}

// POST /api/nocs/[id]/lines
export async function POST(req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const noc_id = await getRouteId(ctx);
  if (!noc_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const noc = await getNocOr404(noc_id);
  if (!noc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await assertContractAccess(usuario_id, noc.contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { partida_origen_id, nueva_cantidad, nuevo_precio_unitario, observacion } =
    normalizeLineBody(body);

  if (!partida_origen_id) {
    return NextResponse.json(
      { error: "partida_origen_id required", hint: "Acepta partida_origen_id o partida_id en el body." },
      { status: 400 }
    );
  }

  // Al menos uno debe venir (permitimos 0 como valor válido)
  if (nueva_cantidad == null && nuevo_precio_unitario == null) {
    return NextResponse.json(
      {
        error: "nueva_cantidad or nuevo_precio_unitario required",
        hint: "Acepta nueva_cantidad/cantidad y nuevo_precio_unitario/precio_unitario.",
      },
      { status: 400 }
    );
  }

  // Validate partida belongs to same contract
  const p = await pool.query(
    "SELECT partida_id, contrato_id, vigente FROM public.partida WHERE partida_id = $1",
    [partida_origen_id]
  );
  const partida = p.rows[0];
  if (!partida) return NextResponse.json({ error: "partida not found" }, { status: 404 });
  if (partida.contrato_id !== noc.contrato_id)
    return NextResponse.json({ error: "partida not in contrato" }, { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO public.noc_linea
      (noc_id, partida_origen_id, nueva_cantidad, nuevo_precio_unitario, observacion)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING noc_linea_id, noc_id, partida_origen_id, partida_resultante_id,
               nueva_cantidad, nuevo_precio_unitario, observacion, created_at`,
    [noc_id, partida_origen_id, nueva_cantidad, nuevo_precio_unitario, observacion]
  );

  await markNocDirtyIfApplied(noc_id);

  return NextResponse.json({ line: rows[0] }, { status: 201 });
}

// PUT /api/nocs/[id]/lines  { noc_linea_id, ... }
export async function PUT(req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const noc_id = await getRouteId(ctx);
  if (!noc_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const noc = await getNocOr404(noc_id);
  if (!noc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await assertContractAccess(usuario_id, noc.contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const noc_linea_id = (body?.noc_linea_id ?? "").toString().trim();
  if (!noc_linea_id) return NextResponse.json({ error: "noc_linea_id required" }, { status: 400 });

  const lineRes = await pool.query(
    `SELECT noc_linea_id, partida_resultante_id
     FROM public.noc_linea
     WHERE noc_linea_id = $1 AND noc_id = $2`,
    [noc_linea_id, noc_id]
  );
  const current = lineRes.rows[0];
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (current.partida_resultante_id)
    return NextResponse.json({ error: "line already applied" }, { status: 400 });

  const normalized = normalizeLineBody(body);

  // partida_origen_id es opcional en PUT
  const partida_origen_id =
    toOptionalString(body?.partida_origen_id) ?? toOptionalString(body?.partida_id) ?? null;

  const nueva_cantidad = normalized.nueva_cantidad;
  const nuevo_precio_unitario = normalized.nuevo_precio_unitario;
  const observacion = normalized.observacion;

  if (partida_origen_id) {
    const p = await pool.query("SELECT partida_id, contrato_id FROM public.partida WHERE partida_id = $1", [
      partida_origen_id,
    ]);
    const partida = p.rows[0];
    if (!partida) return NextResponse.json({ error: "partida not found" }, { status: 404 });
    if (partida.contrato_id !== noc.contrato_id)
      return NextResponse.json({ error: "partida not in contrato" }, { status: 400 });
  }

  if (nueva_cantidad == null && nuevo_precio_unitario == null && observacion == null && !partida_origen_id) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { rows } = await pool.query(
    `UPDATE public.noc_linea
     SET partida_origen_id = COALESCE($3, partida_origen_id),
         nueva_cantidad = COALESCE($4, nueva_cantidad),
         nuevo_precio_unitario = COALESCE($5, nuevo_precio_unitario),
         observacion = COALESCE($6, observacion)
     WHERE noc_linea_id = $1 AND noc_id = $2
     RETURNING noc_linea_id, noc_id, partida_origen_id, partida_resultante_id,
               nueva_cantidad, nuevo_precio_unitario, observacion, created_at`,
    [noc_linea_id, noc_id, partida_origen_id, nueva_cantidad, nuevo_precio_unitario, observacion]
  );

  await markNocDirtyIfApplied(noc_id);

  return NextResponse.json({ line: rows[0] });
}

// DELETE /api/nocs/[id]/lines  { noc_linea_id }
export async function DELETE(req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const noc_id = await getRouteId(ctx);
  if (!noc_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const noc = await getNocOr404(noc_id);
  if (!noc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await assertContractAccess(usuario_id, noc.contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const noc_linea_id = (body?.noc_linea_id ?? "").toString().trim();
  if (!noc_linea_id) return NextResponse.json({ error: "noc_linea_id required" }, { status: 400 });

  const lineRes = await pool.query(
    `SELECT noc_linea_id, partida_resultante_id
     FROM public.noc_linea
     WHERE noc_linea_id = $1 AND noc_id = $2`,
    [noc_linea_id, noc_id]
  );
  const line = lineRes.rows[0];
  if (!line) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (line.partida_resultante_id)
    return NextResponse.json({ error: "cannot delete applied line" }, { status: 400 });

  await pool.query("DELETE FROM public.noc_linea WHERE noc_linea_id = $1", [noc_linea_id]);
  await markNocDirtyIfApplied(noc_id);
  return NextResponse.json({ ok: true });
}
