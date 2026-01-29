import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type ColInfo = { column_name: string };

async function getRouteId(ctx: any): Promise<string> {
  const rawParams = ctx?.params;
  const params = rawParams && typeof rawParams.then === "function" ? await rawParams : rawParams;

  const direct = params?.id ?? params?.noc_id ?? params?.nocId ?? params?.nocID ?? params?.noc;
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

export async function POST(_req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const noc_id = await getRouteId(ctx);
  if (!noc_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const nocRes = await pool.query(
    `SELECT noc_id, contrato_id, status
     FROM public.noc
     WHERE noc_id = $1`,
    [noc_id]
  );
  const noc = nocRes.rows[0];
  if (!noc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ok = await assertContractAccess(usuario_id, noc.contrato_id);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const linesRes = await pool.query(
    `SELECT noc_linea_id, partida_origen_id, nueva_cantidad, nuevo_precio_unitario, partida_resultante_id
     FROM public.noc_linea
     WHERE noc_id = $1
     ORDER BY created_at ASC`,
    [noc_id]
  );
  const lines = linesRes.rows;
  if (!lines.length) return NextResponse.json({ error: "no lines" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const ln of lines) {
      // ✅ Re-apply support:
      // If this NOC was already applied before, we treat the *current vigente version*
      // as the last result (partida_resultante_id). Otherwise, use partida_origen_id.
      const effectiveOriginId =
        ln.partida_resultante_id && noc.status === "applied"
          ? ln.partida_resultante_id
          : ln.partida_origen_id;

      const partidaRes = await client.query(
        `SELECT partida_id, contrato_id, item, descripcion,
                familia_id, subfamilia_id, grupo_id, unidad_id,
                cantidad, precio_unitario, vigente,
                version_prev_id, version_root_id
         FROM public.partida
         WHERE partida_id = $1`,
        [effectiveOriginId]
      );

      const partida = partidaRes.rows[0];
      if (!partida) throw new Error(`partida not found: ${effectiveOriginId}`);
      if (partida.contrato_id !== noc.contrato_id) throw new Error(`partida not in contrato: ${effectiveOriginId}`);
      if (partida.vigente !== true) throw new Error(`partida not vigente: ${effectiveOriginId}`);

      const cantidadNueva = ln.nueva_cantidad ?? partida.cantidad;
      const puNuevo = ln.nuevo_precio_unitario ?? partida.precio_unitario;
      const totalNuevo = Number(cantidadNueva) * Number(puNuevo);

      const rootId = partida.version_root_id ?? partida.partida_id;

      const insertRes = await client.query(
        `INSERT INTO public.partida
          (contrato_id, item, descripcion, familia_id, subfamilia_id, grupo_id, unidad_id,
           cantidad, precio_unitario, total, vigente, noc_id, version_prev_id, version_root_id)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)
         RETURNING partida_id`,
        [
          partida.contrato_id,
          partida.item,
          partida.descripcion,
          partida.familia_id,
          partida.subfamilia_id,
          partida.grupo_id,
          partida.unidad_id,
          cantidadNueva,
          puNuevo,
          totalNuevo,
          noc_id,
          partida.partida_id, // prev
          rootId,             // root
        ]
      );
      const newId = insertRes.rows[0].partida_id;

      // Archive the previous vigente version
      await client.query(`UPDATE public.partida SET vigente = false WHERE partida_id = $1`, [
        partida.partida_id,
      ]);

      // Update line pointer to latest result (keeps history via partida version chain)
      await client.query(
        `UPDATE public.noc_linea
         SET partida_resultante_id = $2
         WHERE noc_linea_id = $1`,
        [ln.noc_linea_id, newId]
      );
    }

    await client.query(
      `UPDATE public.noc
       SET status = 'applied',
           is_dirty = false,
           applied_at = NOW(),
           applied_by = $2
       WHERE noc_id = $1`,
      [noc_id, usuario_id]
    );

    await client.query("COMMIT");
  } catch (e: any) {
    await client.query("ROLLBACK");
    const msg = e?.message || "apply failed";

    if (String(msg).includes("not vigente")) {
      return NextResponse.json(
        {
          error: "cannot apply: some partidas are not vigente",
          detail: msg,
          hint:
            "Esta NOC ya fue superada por otra NOC aplicada sobre alguna partida. No se puede re-aplicar.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "apply failed", detail: msg }, { status: 400 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true });
}
