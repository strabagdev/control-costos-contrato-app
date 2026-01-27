import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export async function PATCH(req: Request, { params }: { params: { id?: string } }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const partida_id = ((params?.id ?? body?.partida_id ?? body?.id ?? "") as any).toString().trim();
  if (!partida_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const vigente = body?.vigente;

  if (typeof vigente !== "boolean") {
    return NextResponse.json({ error: "vigente must be boolean" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE partida
       SET vigente = $1
       WHERE partida_id = $2
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
      [vigente, partida_id]
    );

    if (!rows?.length) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ partida: rows[0] });
  } catch (e: any) {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
