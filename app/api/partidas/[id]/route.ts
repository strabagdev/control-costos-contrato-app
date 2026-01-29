import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type ColInfo = { column_name: string };

async function getRouteId(ctx: any): Promise<string> {
  const rawParams = ctx?.params;
  const params = rawParams && typeof rawParams.then === "function" ? await rawParams : rawParams;

  const direct = params?.id ?? params?.partida_id ?? params?.partidaId ?? params?.partida;
  if (direct) return String(direct);

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

function isUuid(v: any) {
  return typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
}

export async function GET(_req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const partida_id = await getRouteId(ctx);
  if (!partida_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT partida_id, contrato_id, item, descripcion, familia_id, subfamilia_id, grupo_id, unidad_id,
            cantidad, precio_unitario, total, vigente, noc_id, version_prev_id, version_root_id
     FROM public.partida
     WHERE partida_id = $1`,
    [partida_id]
  );

  if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const usuario_id = await resolveUsuarioId(session);
  if (usuario_id) {
    const ok = await assertContractAccess(usuario_id, rows[0].contrato_id);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ partida: rows[0] });
}

export async function PUT(req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const partida_id = await getRouteId(ctx);
  if (!partida_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Traer estado actual + contrato para validar acceso
  const currentRes = await pool.query(
    `SELECT contrato_id, noc_id, version_prev_id, vigente
     FROM public.partida
     WHERE partida_id = $1`,
    [partida_id]
  );
  const current = currentRes.rows[0];
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await assertContractAccess(usuario_id, current.contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const touchedByNoc = Boolean(current.noc_id) || Boolean(current.version_prev_id);

  // ✅ Política:
  // - Si la partida NO tiene NOC (noc_id null) y NO es una versión derivada (version_prev_id null) -> edición completa
  // - Si fue tocada por NOC o es versión derivada -> edición limitada (para no romper trazabilidad)
  const allowedFull = !touchedByNoc;

  // Campos posibles
  const next: any = {};

  // Siempre editable (inicial y también cuando tocada por NOC, si quieres)
  if (typeof body?.descripcion === "string") next.descripcion = body.descripcion;

  if (typeof body?.cantidad === "number") next.cantidad = body.cantidad;
  if (typeof body?.precio_unitario === "number") next.precio_unitario = body.precio_unitario;

  // Solo editable si no ha sido tocada por NOC (carga inicial / correcciones estructurales)
  const lockedAttempt: string[] = [];
  if (allowedFull) {
    if (typeof body?.item === "string") next.item = body.item;

    // FKs: aceptamos UUID o null explícito
    if (body?.familia_id === null || isUuid(body?.familia_id)) next.familia_id = body.familia_id;
    if (body?.subfamilia_id === null || isUuid(body?.subfamilia_id)) next.subfamilia_id = body.subfamilia_id;
    if (body?.grupo_id === null || isUuid(body?.grupo_id)) next.grupo_id = body.grupo_id;
    if (body?.unidad_id === null || isUuid(body?.unidad_id)) next.unidad_id = body.unidad_id;

    if (typeof body?.vigente === "boolean") next.vigente = body.vigente;
  } else {
    // Detectar intento de tocar campos bloqueados
    for (const k of ["item","familia_id","subfamilia_id","grupo_id","unidad_id","vigente"]) {
      if (k in (body || {})) lockedAttempt.push(k);
    }
  }

  if (lockedAttempt.length) {
    return NextResponse.json(
      {
        error: "partida locked (touched by NOC)",
        detail: "Esta partida ya fue derivada por una NOC (o es una versión). Solo se permite editar descripción/cantidad/PU.",
        fields_blocked: lockedAttempt,
      },
      { status: 400 }
    );
  }

  if (Object.keys(next).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  // Construir UPDATE dinámico
  const sets: string[] = [];
  const values: any[] = [partida_id];
  let idx = 2;
  for (const [k, v] of Object.entries(next)) {
    sets.push(`${k} = $${idx}`);
    values.push(v);
    idx++;
  }

  // ⛔ NO tocar 'total' (columna generada)
  const q = `
    UPDATE public.partida
    SET ${sets.join(", ")}
    WHERE partida_id = $1
    RETURNING partida_id, contrato_id, item, descripcion, familia_id, subfamilia_id, grupo_id, unidad_id,
              cantidad, precio_unitario, total, vigente, noc_id, version_prev_id, version_root_id
  `;

  const { rows } = await pool.query(q, values);
  return NextResponse.json({ partida: rows[0] });
}
