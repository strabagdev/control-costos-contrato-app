import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

function roleOf(session: any) {
  return (session?.user as any)?.role as string | undefined;
}

function canAccess(session: any) {
  const r = roleOf(session);
  return r === "admin" || r === "editor" || r === "viewer";
}

export async function GET(_req: Request, ctx: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canAccess(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const partida_id = await getRouteId(ctx);
  if (!partida_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Fetch chain backwards (current -> prev -> ... -> root)
  const { rows } = await pool.query(
    `
    WITH RECURSIVE chain AS (
      SELECT
        p.partida_id, p.version_prev_id, p.version_root_id, p.vigente,
        p.item, p.descripcion, p.cantidad, p.precio_unitario, p.total, p.noc_id,
        0 AS depth
      FROM public.partida p
      WHERE p.partida_id = $1

      UNION ALL

      SELECT
        prev.partida_id, prev.version_prev_id, prev.version_root_id, prev.vigente,
        prev.item, prev.descripcion, prev.cantidad, prev.precio_unitario, prev.total, prev.noc_id,
        c.depth + 1
      FROM public.partida prev
      JOIN chain c ON c.version_prev_id = prev.partida_id
      WHERE c.version_prev_id IS NOT NULL
    )
    SELECT * FROM chain
    ORDER BY depth DESC
    `,
    [partida_id]
  );

  return NextResponse.json({ chain: rows });
}
