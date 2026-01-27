import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

function toNumberOrNull(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const contrato_id = (url.searchParams.get("contrato_id") ?? "").toString().trim();

  if (!contrato_id) {
    return NextResponse.json({ error: "contrato_id required" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         partida_id,
         partida_id AS id,
         contrato_id,
         item,
         descripcion,
         familia_id,
         subfamilia_id,
         grupo_id,
         unidad_id,
         cantidad,
         precio_unitario,
         vigente,
         created_at
       FROM partida
       WHERE contrato_id = $1
       ORDER BY item ASC`,
      [contrato_id]
    );

    return NextResponse.json({ partidas: rows });
  } catch (e: any) {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);

  const contrato_id = (body?.contrato_id ?? "").toString().trim();
  const item = (body?.item ?? "").toString().trim();
  const descripcion = (body?.descripcion ?? "").toString().trim();

  const familia_id = body?.familia_id ?? null;
  const subfamilia_id = body?.subfamilia_id ?? null;
  const grupo_id = body?.grupo_id ?? null;
  const unidad_id = body?.unidad_id ?? null;

  const cantidad = toNumberOrNull(body?.cantidad);
  const precio_unitario = toNumberOrNull(body?.precio_unitario);

  const vigente =
    body?.vigente === undefined || body?.vigente === null ? true : Boolean(body.vigente);

  if (!contrato_id || !item) {
    return NextResponse.json({ error: "contrato_id and item required" }, { status: 400 });
  }
  if (cantidad === null || cantidad < 0) {
    return NextResponse.json({ error: "cantidad must be a number >= 0" }, { status: 400 });
  }
  if (precio_unitario === null || precio_unitario < 0) {
    return NextResponse.json({ error: "precio_unitario must be a number >= 0" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO partida (
         contrato_id,
         item,
         descripcion,
         familia_id,
         subfamilia_id,
         grupo_id,
         unidad_id,
         cantidad,
         precio_unitario,
         vigente
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING
         partida_id,
         partida_id AS id,
         contrato_id,
         item,
         descripcion,
         familia_id,
         subfamilia_id,
         grupo_id,
         unidad_id,
         cantidad,
         precio_unitario,
         vigente,
         created_at`,
      [
        contrato_id,
        item,
        descripcion || null,
        familia_id,
        subfamilia_id,
        grupo_id,
        unidad_id,
        cantidad,
        precio_unitario,
        vigente,
      ]
    );

    return NextResponse.json({ partida: rows[0] }, { status: 201 });
  } catch (e: any) {
    const code = (e?.code ?? "").toString();
    const msg = (e?.message ?? "").toString();

    if (code === "23505" || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "duplicate item for contrato" }, { status: 409 });
    }
    if (code === "23503") {
      return NextResponse.json({ error: "invalid foreign key" }, { status: 400 });
    }

    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
