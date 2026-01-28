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

function toNum(v: any) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// POST /api/nocs/[id]/apply
export async function POST(_req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const noc_id = (ctx?.params?.id ?? "").toString();
  if (!noc_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock NOC
    const nocRes = await client.query(
      "SELECT noc_id, contrato_id FROM public.noc WHERE noc_id = $1 FOR UPDATE",
      [noc_id]
    );
    const noc = nocRes.rows[0];
    if (!noc) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const ok = await assertContractAccess(usuario_id, noc.contrato_id);
    if (!ok) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Lock lines
    const linesRes = await client.query(
      `SELECT noc_linea_id, partida_origen_id, partida_resultante_id, nueva_cantidad, nuevo_precio_unitario
       FROM public.noc_linea
       WHERE noc_id = $1
       ORDER BY created_at ASC
       FOR UPDATE`,
      [noc_id]
    );

    if (linesRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "noc has no lines" }, { status: 400 });
    }

    // Prevent re-apply if any resultante already set
    const already = linesRes.rows.find((l: any) => !!l.partida_resultante_id);
    if (already) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "noc already applied (has resultante)" }, { status: 400 });
    }

    let applied = 0;
    const resultantes: { noc_linea_id: string; partida_resultante_id: string }[] = [];

    for (const line of linesRes.rows) {
      const noc_linea_id = line.noc_linea_id as string;
      const partida_origen_id = line.partida_origen_id as string | null;
      if (!partida_origen_id) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `line ${noc_linea_id}: partida_origen_id missing` }, { status: 400 });
      }

      // Lock partida origen
      const pRes = await client.query(
        `SELECT *
         FROM public.partida
         WHERE partida_id = $1
         FOR UPDATE`,
        [partida_origen_id]
      );
      const p = pRes.rows[0];
      if (!p) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `line ${noc_linea_id}: partida not found` }, { status: 404 });
      }
      if (p.contrato_id !== noc.contrato_id) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `line ${noc_linea_id}: partida not in contrato` }, { status: 400 });
      }
      if (p.vigente !== true) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `line ${noc_linea_id}: partida not vigente` }, { status: 400 });
      }

      const nuevaCantidad = toNum(line.nueva_cantidad);
      const nuevoPU = toNum(line.nuevo_precio_unitario);

      // Final values default to current
      const cantidad_final = nuevaCantidad != null ? nuevaCantidad : toNum(p.cantidad) ?? 0;
      const precio_unitario_final = nuevoPU != null ? nuevoPU : toNum(p.precio_unitario) ?? 0;

      // 1) Set origen not vigente
      await client.query(
        "UPDATE public.partida SET vigente = false WHERE partida_id = $1",
        [partida_origen_id]
      );

      // 2) Insert resultante vigente (total is generated)
      const ins = await client.query(
        `INSERT INTO public.partida
         (contrato_id, item, descripcion, familia_id, subfamilia_id, grupo_id,
          cantidad, unidad_id, precio_unitario, vigente,
          origen_tipo, origen_id, noc_id, estado_operativo)
         VALUES
         ($1,$2,$3,$4,$5,$6,
          $7,$8,$9,true,
          'noc',$10,$10,$11)
         RETURNING partida_id`,
        [
          p.contrato_id,
          p.item,
          p.descripcion,
          p.familia_id,
          p.subfamilia_id,
          p.grupo_id,
          cantidad_final,
          p.unidad_id,
          precio_unitario_final,
          noc_id, // origen_id and noc_id
          p.estado_operativo,
        ]
      );

      const partida_resultante_id = ins.rows[0].partida_id as string;

      // 3) Link line -> resultante
      await client.query(
        "UPDATE public.noc_linea SET partida_resultante_id = $2 WHERE noc_linea_id = $1",
        [noc_linea_id, partida_resultante_id]
      );

      applied += 1;
      resultantes.push({ noc_linea_id, partida_resultante_id });
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, applied, resultantes });
  } catch (e: any) {
    try { await client.query("ROLLBACK"); } catch {}
    return NextResponse.json({ error: e?.message || "apply failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
