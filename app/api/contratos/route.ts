import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { rows } = await pool.query(
      `SELECT
         c.contrato_id,
         c.nombre,
         COALESCE(c.descripcion, '') AS descripcion,
         COALESCE(p.cnt, 0)::int AS partidas_count,
         COALESCE(n.cnt, 0)::int AS noc_count,
         COALESCE(uc.cnt, 0)::int AS user_links_count
       FROM public.contrato c
       LEFT JOIN (SELECT contrato_id, COUNT(*) cnt FROM public.partida GROUP BY contrato_id) p
         ON p.contrato_id = c.contrato_id
       LEFT JOIN (SELECT contrato_id, COUNT(*) cnt FROM public.noc GROUP BY contrato_id) n
         ON n.contrato_id = c.contrato_id
       LEFT JOIN (SELECT contrato_id, COUNT(*) cnt FROM public.user_contract GROUP BY contrato_id) uc
         ON uc.contrato_id = c.contrato_id
       ORDER BY c.nombre`
    );
    return NextResponse.json({ contratos: rows });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const nombre = (body?.nombre ?? "").toString().trim();
  const descripcion = (body?.descripcion ?? "").toString().trim();

  if (!nombre) return NextResponse.json({ error: "nombre required" }, { status: 400 });

  try {
    // contrato_id is UUID autogenerado por DEFAULT gen_random_uuid()
    const r = await pool.query(
      "INSERT INTO public.contrato (nombre, descripcion) VALUES ($1,$2) RETURNING contrato_id",
      [nombre, descripcion || null]
    );
    return NextResponse.json({ ok: true, contrato_id: r.rows[0]?.contrato_id });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const contrato_id = (body?.contrato_id ?? "").toString().trim();
  const nombre = (body?.nombre ?? "").toString().trim();
  const descripcion = (body?.descripcion ?? "").toString().trim();

  if (!contrato_id) return NextResponse.json({ error: "contrato_id required" }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "nombre required" }, { status: 400 });

  try {
    const r = await pool.query(
      "UPDATE public.contrato SET nombre = $2, descripcion = $3 WHERE contrato_id = $1",
      [contrato_id, nombre, descripcion || null]
    );

    if (r.rowCount === 0) {
      return NextResponse.json({ error: "contrato not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const contrato_id = (body?.contrato_id ?? "").toString().trim();
  if (!contrato_id) return NextResponse.json({ error: "contrato_id required" }, { status: 400 });

  try {
    // Validations: block delete if any dependencies exist
    const [p, n, uc] = await Promise.all([
      pool.query("SELECT 1 FROM public.partida WHERE contrato_id = $1 LIMIT 1", [contrato_id]),
      pool.query("SELECT 1 FROM public.noc WHERE contrato_id = $1 LIMIT 1", [contrato_id]),
      pool.query("SELECT 1 FROM public.user_contract WHERE contrato_id = $1 LIMIT 1", [contrato_id]),
    ]);

    if (p.rowCount > 0) {
      return NextResponse.json({ error: "cannot delete: contrato has partidas" }, { status: 409 });
    }
    if (n.rowCount > 0) {
      return NextResponse.json({ error: "cannot delete: contrato has noc" }, { status: 409 });
    }
    if (uc.rowCount > 0) {
      return NextResponse.json({ error: "cannot delete: contrato has user assignments" }, { status: 409 });
    }

    const r = await pool.query("DELETE FROM public.contrato WHERE contrato_id = $1", [contrato_id]);
    if (r.rowCount === 0) {
      return NextResponse.json({ error: "contrato not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
