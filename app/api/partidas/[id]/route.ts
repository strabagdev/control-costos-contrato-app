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

export async function PUT(req: Request, { params }: { params: { id?: string } }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);

  // Be robust: accept ID either from route param or body
  const partida_id = ((params?.id ?? body?.partida_id ?? body?.id ?? "") as any).toString().trim();
  if (!partida_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const item = body?.item !== undefined ? (body.item ?? "").toString().trim() : undefined;
  const descripcion =
    body?.descripcion !== undefined ? (body.descripcion ?? "").toString().trim() : undefined;

  const familia_id = body?.familia_id !== undefined ? body.familia_id : undefined;
  const subfamilia_id = body?.subfamilia_id !== undefined ? body.subfamilia_id : undefined;
  const grupo_id = body?.grupo_id !== undefined ? body.grupo_id : undefined;
  const unidad_id = body?.unidad_id !== undefined ? body.unidad_id : undefined;

  const cantidad = body?.cantidad !== undefined ? toNumberOrNull(body.cantidad) : undefined;
  const precio_unitario =
    body?.precio_unitario !== undefined ? toNumberOrNull(body.precio_unitario) : undefined;

  const vigente = body?.vigente !== undefined ? Boolean(body.vigente) : undefined;

  if (item !== undefined && !item) {
    return NextResponse.json({ error: "item cannot be empty" }, { status: 400 });
  }
  if (cantidad !== undefined && (cantidad === null || cantidad < 0)) {
    return NextResponse.json({ error: "cantidad must be a number >= 0" }, { status: 400 });
  }
  if (precio_unitario !== undefined && (precio_unitario === null || precio_unitario < 0)) {
    return NextResponse.json({ error: "precio_unitario must be a number >= 0" }, { status: 400 });
  }

  const sets: string[] = [];
  const values: any[] = [];
  let i = 1;

  function addSet(col: string, val: any) {
    sets.push(`${col} = $${i}`);
    values.push(val);
    i += 1;
  }

  if (item !== undefined) addSet("item", item);
  if (descripcion !== undefined) addSet("descripcion", descripcion || null);
  if (familia_id !== undefined) addSet("familia_id", familia_id);
  if (subfamilia_id !== undefined) addSet("subfamilia_id", subfamilia_id);
  if (grupo_id !== undefined) addSet("grupo_id", grupo_id);
  if (unidad_id !== undefined) addSet("unidad_id", unidad_id);
  if (cantidad !== undefined) addSet("cantidad", cantidad);
  if (precio_unitario !== undefined) addSet("precio_unitario", precio_unitario);
  if (vigente !== undefined) addSet("vigente", vigente);

  if (sets.length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  values.push(partida_id);

  try {
    const { rows } = await pool.query(
      `UPDATE partida
       SET ${sets.join(", ")}
       WHERE partida_id = $${i}
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
      values
    );

    if (!rows?.length) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ partida: rows[0] });
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
